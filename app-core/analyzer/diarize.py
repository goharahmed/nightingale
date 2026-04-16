"""Multi-singer vocal splitting: iterative BS-Roformer + voice-signature refinement.

Pipeline overview:
  1. **BS Roformer initial separation** — spectral male/female source separation
     via audio_separator (SDR 24+).  Gets ~85 % clean on the first pass.
  2. **Iterative residual recovery** — re-runs BS Roformer on each stem from
     Pass 1 to extract vocals that bled into the wrong track.  The recovered
     bleed is mixed back into the correct singer's track:
       Pass 2a: re-split(stem1) → cleaned_s1 + recovered_s2_bleed
       Pass 2b: re-split(stem2) → recovered_s1_bleed + cleaned_s2
       final_singer1 = cleaned_s1 + recovered_s1_bleed
       final_singer2 = cleaned_s2 + recovered_s2_bleed
  3. **Voice-signature refinement** (optional) — uses Resemblyzer speaker
     embeddings to correct any remaining overlap bleed via soft masking.

This three-stage approach gets the best of all worlds:
  • BS Roformer does the heavy spectral lifting (trained on singing voices).
  • Iterative cleaning recovers vocals that bled into the wrong track.
  • Voice signatures provide a final polish for overlapping sections.
"""

import json
import os
import subprocess

import numpy as np

from whisper_compat import free_gpu, progress

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MALE_FEMALE_MODEL = "model_chorus_bs_roformer_ep_267_sdr_24.1275.ckpt"

# Resemblyzer operates at 16 kHz internally
_RESEMBLYZER_SR = 16000

# Voice-signature refinement parameters
_SOLO_ENERGY_RATIO = 3.0     # stem energy must be ≥ N× the other to be "solo"
_SOLO_MIN_DURATION = 1.0     # minimum solo window duration (seconds)
_EMBED_WINDOW_SEC = 1.6      # sliding window length for embedding comparison
_EMBED_HOP_SEC = 0.4         # sliding window hop for embedding comparison
_REFINE_THRESHOLD = 0.15     # cosine-similarity difference threshold for reassignment
_CROSSFADE_MS = 20           # crossfade at reassignment boundaries (ms)


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------
def _ffmpeg_bin():
    return os.environ.get("FFMPEG_PATH", "ffmpeg")


def _wav_to_mp3(wav_path, mp3_path):
    subprocess.run(
        [_ffmpeg_bin(), "-y", "-i", wav_path,
         "-c:a", "libmp3lame", "-q:a", "2", "-v", "error", mp3_path],
        check=True,
    )
    os.remove(wav_path)


def _to_mp3_if_needed(src_path, mp3_path):
    """Convert to MP3 if the source isn't already MP3, otherwise just rename."""
    if src_path.lower().endswith(".mp3"):
        os.rename(src_path, mp3_path)
    else:
        _wav_to_mp3(src_path, mp3_path)


def _load_wav_mono(path, target_sr):
    """Load an audio file as mono float32 numpy array at the given sample rate."""
    import librosa
    wav, _ = librosa.load(path, sr=target_sr, mono=True)
    return wav


def _rms_envelope(wav, sr, frame_sec=0.05):
    """Compute RMS energy envelope with the given frame length."""
    frame_len = int(sr * frame_sec)
    n_frames = len(wav) // frame_len
    wav_trimmed = wav[:n_frames * frame_len].reshape(n_frames, frame_len)
    return np.sqrt(np.mean(wav_trimmed ** 2, axis=1))


def _resolve_stem_paths(output_files, directory):
    """Resolve audio_separator output paths to absolute paths.

    audio_separator.separate() returns bare filenames (no directory).
    We join them with the given directory and verify they exist on disk.
    """
    resolved = []
    for f in output_files:
        if os.path.isabs(f) and os.path.isfile(f):
            resolved.append(f)
            continue
        # Try joining with the expected directory
        full = os.path.join(directory, os.path.basename(f))
        if os.path.isfile(full):
            resolved.append(full)
            continue
        # Last resort: maybe it's relative to cwd
        if os.path.isfile(f):
            resolved.append(os.path.abspath(f))
    return resolved


def _mix_and_normalize(wav_a, wav_b):
    """Sum two audio arrays and normalise to prevent clipping.

    Both inputs should be numpy arrays from soundfile.read() — either 1-D
    (mono) or 2-D with shape (n_samples, n_channels).
    """
    min_len = min(len(wav_a), len(wav_b))
    mixed = wav_a[:min_len].astype(np.float64) + wav_b[:min_len].astype(np.float64)
    peak = np.max(np.abs(mixed))
    if peak > 0.99:
        mixed = mixed * (0.99 / peak)
    return mixed.astype(np.float32)


# ---------------------------------------------------------------------------
# Stages 1–2: Iterative BS Roformer separation
# ---------------------------------------------------------------------------
def separate_singers(vocals_path, output_dir, file_hash, models_dir,
                     device="cpu"):
    """Separate a vocals stem into two singer tracks using iterative BS Roformer.

    Uses a three-pass approach for cleaner results:

      Pass 1  – split combined vocals → stem1 (mostly singer-1) + stem2
      Pass 2a – re-split stem1 → cleaned_s1 (pure) + bleed_s2 (recovered)
      Pass 2b – re-split stem2 → bleed_s1 (recovered) + cleaned_s2 (pure)
      Mix     – final_singer1 = cleaned_s1 + bleed_s1
                final_singer2 = cleaned_s2 + bleed_s2

    The second pass is easier for the model because each stem is already
    dominated by one voice — the leaked bleed stands out as foreign
    spectral content and is cleanly extracted.

    Returns (singer_1_path, singer_2_path) as MP3 files.
    """
    import tempfile
    import soundfile as sf_lib
    from audio_separator.separator import Separator

    progress(5, "Loading singer separation model...")

    with tempfile.TemporaryDirectory(prefix="nightingale_singers_") as work_dir:
        # Sub-directories keep each pass's outputs tidy
        pass1_dir = os.path.join(work_dir, "pass1")
        pass2a_dir = os.path.join(work_dir, "pass2a")
        pass2b_dir = os.path.join(work_dir, "pass2b")
        os.makedirs(pass1_dir)
        os.makedirs(pass2a_dir)
        os.makedirs(pass2b_dir)

        separator = Separator(
            model_file_dir=models_dir,
            output_dir=pass1_dir,
            output_format="wav",
        )
        separator.load_model(MALE_FEMALE_MODEL)

        # ── Force 32-bit float WAV for all intermediate passes ──────
        # audio_separator defaults to 16-bit when the input is MP3
        # (unknown subtype MPEG_LAYER_III).  Its prepare_mix() method
        # overwrites input_bit_depth from the file on *every* call to
        # separate(), so a simple attribute set doesn't stick.  We wrap
        # prepare_mix to re-apply 32-bit float after the probe runs.
        # For iterative separation this matters: the bleed signal we
        # recover in Pass 2 is quiet (~15-20 dB below the main vocal),
        # so 16-bit quantisation loses subtle detail that 32-bit float
        # preserves perfectly.
        mi = getattr(separator, "model_instance", None)
        if mi is not None:
            _orig_prepare_mix = mi.prepare_mix

            def _prepare_mix_float32(mix):
                result = _orig_prepare_mix(mix)
                mi.input_bit_depth = 32
                mi.input_subtype = "FLOAT"
                return result

            mi.prepare_mix = _prepare_mix_float32
            print("[nightingale:LOG] Patched prepare_mix for 32-bit float output",
                  flush=True)

        def _set_output_dir(d):
            """Sync output_dir on BOTH the wrapper and the model instance."""
            separator.output_dir = d
            if mi is not None:
                mi.output_dir = d

        # ── Pass 1: Initial separation ──────────────────────────────
        _set_output_dir(pass1_dir)
        progress(10, "Pass 1/3: Initial singer separation...")
        pass1_files = separator.separate(vocals_path)
        pass1_stems = _resolve_stem_paths(pass1_files, pass1_dir)

        print(f"[nightingale:LOG] Pass 1 outputs: {pass1_files}", flush=True)

        if len(pass1_stems) < 2:
            raise RuntimeError(
                f"Expected 2 singer stems from pass 1, got "
                f"{len(pass1_stems)}: {pass1_files}"
            )

        stem1_pass1 = pass1_stems[0]  # mostly singer 1 (female channel)
        stem2_pass1 = pass1_stems[1]  # mostly singer 2 (male channel)

        # ── Pass 2a: Re-separate stem 1 to extract bleed ────────────
        _set_output_dir(pass2a_dir)
        progress(25, "Pass 2/3: Cleaning singer 1 stem...")
        pass2a_files = separator.separate(stem1_pass1)
        pass2a_stems = _resolve_stem_paths(pass2a_files, pass2a_dir)

        print(f"[nightingale:LOG] Pass 2a outputs: {pass2a_files}", flush=True)

        if len(pass2a_stems) < 2:
            raise RuntimeError(
                f"Expected 2 stems from pass 2a, got "
                f"{len(pass2a_stems)}: {pass2a_files}"
            )

        # stem1 was mostly singer-1, so after re-separation:
        #   pass2a_stems[0] = cleaned singer-1 (female channel)
        #   pass2a_stems[1] = recovered singer-2 bleed (male channel)

        # ── Pass 2b: Re-separate stem 2 to extract bleed ────────────
        _set_output_dir(pass2b_dir)
        progress(40, "Pass 3/3: Cleaning singer 2 stem...")
        pass2b_files = separator.separate(stem2_pass1)
        pass2b_stems = _resolve_stem_paths(pass2b_files, pass2b_dir)

        print(f"[nightingale:LOG] Pass 2b outputs: {pass2b_files}", flush=True)

        if len(pass2b_stems) < 2:
            raise RuntimeError(
                f"Expected 2 stems from pass 2b, got "
                f"{len(pass2b_stems)}: {pass2b_files}"
            )

        # stem2 was mostly singer-2, so after re-separation:
        #   pass2b_stems[0] = recovered singer-1 bleed (male channel)
        #   pass2b_stems[1] = cleaned singer-2 (female channel)

        del separator
        free_gpu()

        # ── Mix: Combine cleaned primary + recovered bleed ──────────
        progress(55, "Combining refined singer stems...")

        cleaned_s1, sr = sf_lib.read(pass2a_stems[0])  # clean singer-1
        bleed_s2, _    = sf_lib.read(pass2a_stems[1])  # singer-2 bleed from stem1
        bleed_s1, _    = sf_lib.read(pass2b_stems[0])  # singer-1 bleed from stem2
        cleaned_s2, _  = sf_lib.read(pass2b_stems[1])  # clean singer-2

        # final singer 1 = cleaned singer-1 + recovered singer-1 bleed
        final_singer_1 = _mix_and_normalize(cleaned_s1, bleed_s1)
        # final singer 2 = cleaned singer-2 + recovered singer-2 bleed
        final_singer_2 = _mix_and_normalize(cleaned_s2, bleed_s2)

        print(
            f"[nightingale:LOG] Iterative mixing complete — "
            f"singer-1: {len(cleaned_s1)}+{len(bleed_s1)} samples, "
            f"singer-2: {len(cleaned_s2)}+{len(bleed_s2)} samples",
            flush=True,
        )

        # Write final WAVs then convert to MP3
        progress(58, "Encoding final stems to MP3...")

        final_s1_wav = os.path.join(work_dir, "final_singer_1.wav")
        final_s2_wav = os.path.join(work_dir, "final_singer_2.wav")
        sf_lib.write(final_s1_wav, final_singer_1, sr)
        sf_lib.write(final_s2_wav, final_singer_2, sr)

        singer_1_mp3 = os.path.join(
            output_dir, f"{file_hash}_vocals_singer_1.mp3")
        singer_2_mp3 = os.path.join(
            output_dir, f"{file_hash}_vocals_singer_2.mp3")

        _wav_to_mp3(final_s1_wav, singer_1_mp3)
        _wav_to_mp3(final_s2_wav, singer_2_mp3)

    return singer_1_mp3, singer_2_mp3


# ---------------------------------------------------------------------------
# Stage 3: Voice-signature refinement
# ---------------------------------------------------------------------------
def _find_solo_windows(rms1, rms2, frame_sec, min_duration, energy_ratio):
    """Find time-windows where one singer is clearly dominant (solo).

    Returns two lists of (start_frame, end_frame) tuples — one per singer.
    A "solo window" is a contiguous run of frames where one singer's RMS
    energy is at least `energy_ratio` × the other singer's energy.
    """
    min_frames = max(1, int(min_duration / frame_sec))
    solos = [[], []]  # solos[0] = singer-1 solo windows, solos[1] = singer-2

    for singer_idx, (mine, theirs) in enumerate([(rms1, rms2), (rms2, rms1)]):
        # Boolean mask: True where this singer dominates
        dominant = mine > (theirs * energy_ratio)
        # Also require that this singer has *some* energy (not silence)
        noise_floor = np.percentile(mine[mine > 0], 10) if np.any(mine > 0) else 1e-8
        dominant = dominant & (mine > noise_floor)

        # Find contiguous runs
        run_start = None
        for i in range(len(dominant)):
            if dominant[i] and run_start is None:
                run_start = i
            elif not dominant[i] and run_start is not None:
                if i - run_start >= min_frames:
                    solos[singer_idx].append((run_start, i))
                run_start = None
        if run_start is not None and len(dominant) - run_start >= min_frames:
            solos[singer_idx].append((run_start, len(dominant)))

    return solos[0], solos[1]


def _extract_voice_signatures(wav1_16k, wav2_16k, solo_windows_1, solo_windows_2,
                              frame_sec, encoder):
    """Extract a Resemblyzer embedding for each singer from their solo windows.

    Concatenates the audio from all solo windows for each singer (at 16 kHz)
    and computes a single speaker embedding. Falls back to the full stem if
    no solo windows were found.
    """
    from resemblyzer import preprocess_wav

    def _gather(wav, windows):
        sr = _RESEMBLYZER_SR
        chunks = []
        for (sf, ef) in windows:
            s_sample = int(sf * frame_sec * sr)
            e_sample = int(ef * frame_sec * sr)
            chunk = wav[s_sample:e_sample]
            if len(chunk) > 0:
                chunks.append(chunk)
        if chunks:
            return np.concatenate(chunks)
        # Fallback: use the whole stem (better than nothing)
        return wav

    solo_wav_1 = _gather(wav1_16k, solo_windows_1)
    solo_wav_2 = _gather(wav2_16k, solo_windows_2)

    # Resemblyzer expects preprocessed audio (trimmed silences, normalised)
    solo_wav_1 = preprocess_wav(solo_wav_1, source_sr=_RESEMBLYZER_SR)
    solo_wav_2 = preprocess_wav(solo_wav_2, source_sr=_RESEMBLYZER_SR)

    embed_1 = encoder.embed_utterance(solo_wav_1)
    embed_2 = encoder.embed_utterance(solo_wav_2)

    return embed_1, embed_2


def _refine_with_embeddings(stem1_path, stem2_path, embed_1, embed_2,
                            encoder, work_sr=44100):
    """Use voice embeddings to fix overlap bleed between the two stems.

    For each sliding window of the **mixed** signal (stem1 + stem2), we
    compute a Resemblyzer embedding and measure cosine similarity to each
    singer's reference. Where the similarity strongly favours one singer,
    we attenuate the *other* singer's stem by a soft gain mask.

    This corrects the common problem where singer-2's trailing vocal
    bleeds into singer-1's stem during overlapping sections.

    Modifies the stem files **in-place** (overwrites with refined WAV,
    then the caller converts to MP3).
    """
    import librosa
    import soundfile as sf
    from resemblyzer import preprocess_wav

    # Load stems at their native rate for output quality
    stem1_native, native_sr = librosa.load(stem1_path, sr=None, mono=False)
    stem2_native, _ = librosa.load(stem2_path, sr=None, mono=False)

    # Ensure same length
    min_len = min(stem1_native.shape[-1], stem2_native.shape[-1])
    stem1_native = stem1_native[..., :min_len]
    stem2_native = stem2_native[..., :min_len]

    # Load mono 16 kHz versions for embedding comparison
    stem1_16k = _load_wav_mono(stem1_path, _RESEMBLYZER_SR)
    stem2_16k = _load_wav_mono(stem2_path, _RESEMBLYZER_SR)
    min_16k = min(len(stem1_16k), len(stem2_16k))
    stem1_16k = stem1_16k[:min_16k]
    stem2_16k = stem2_16k[:min_16k]

    # Mix for embedding comparison (sum of both stems)
    mix_16k = stem1_16k + stem2_16k

    # Sliding window parameters (in samples at 16 kHz)
    win_samples = int(_EMBED_WINDOW_SEC * _RESEMBLYZER_SR)
    hop_samples = int(_EMBED_HOP_SEC * _RESEMBLYZER_SR)

    n_windows = max(1, (len(mix_16k) - win_samples) // hop_samples + 1)

    # Compute per-window similarity to each singer's reference embedding
    sim_1 = np.zeros(n_windows, dtype=np.float32)
    sim_2 = np.zeros(n_windows, dtype=np.float32)

    for i in range(n_windows):
        start = i * hop_samples
        end = start + win_samples
        window_wav = mix_16k[start:end]
        if len(window_wav) < win_samples // 2:
            continue

        # Skip near-silent windows
        if np.max(np.abs(window_wav)) < 1e-4:
            continue

        window_wav = preprocess_wav(window_wav, source_sr=_RESEMBLYZER_SR)
        if len(window_wav) < _RESEMBLYZER_SR * 0.2:  # too short after preprocessing
            continue

        emb = encoder.embed_utterance(window_wav)
        # Cosine similarity (embeddings are already L2-normalised)
        sim_1[i] = float(np.dot(emb, embed_1))
        sim_2[i] = float(np.dot(emb, embed_2))

    # Build a per-sample soft reassignment mask at native sample rate.
    # Positive diff → more like singer 1, negative → more like singer 2.
    # We only act where the difference exceeds the threshold.
    diff = sim_1 - sim_2  # per-window

    # Interpolate from window-level to sample-level at native SR
    # Window centres in seconds
    window_centres = np.array([(i * hop_samples + win_samples / 2) / _RESEMBLYZER_SR
                               for i in range(n_windows)])
    sample_times = np.linspace(0, min_len / native_sr, min_len)

    diff_interp = np.interp(sample_times, window_centres, diff)

    # Compute gain adjustments.
    # Where diff > threshold: singer-1 dominant → attenuate singer-2 stem.
    # Where diff < -threshold: singer-2 dominant → attenuate singer-1 stem.
    # In the middle zone (|diff| < threshold): no change.
    #
    # We use a smooth sigmoid-shaped attenuation rather than hard cutoff.
    # gain_1 = attenuation applied to stem-1 (1.0 = unchanged, 0.0 = full attenuation)
    # gain_2 = attenuation applied to stem-2

    def _sigmoid_mask(x, threshold, sharpness=10.0):
        """Soft mask: 1 where x < -threshold, 0 where x > threshold."""
        return 1.0 / (1.0 + np.exp(sharpness * (x - threshold)))

    # stem-1 should be attenuated where singer-2 dominates (diff << 0)
    gain_1 = _sigmoid_mask(-diff_interp, _REFINE_THRESHOLD)
    # stem-2 should be attenuated where singer-1 dominates (diff >> 0)
    gain_2 = _sigmoid_mask(diff_interp, _REFINE_THRESHOLD)

    # Apply a short crossfade to avoid clicks at gain transitions
    cf_samples = int(native_sr * _CROSSFADE_MS / 1000)
    if cf_samples > 1:
        from scipy.ndimage import uniform_filter1d
        gain_1 = uniform_filter1d(gain_1, size=cf_samples).astype(np.float32)
        gain_2 = uniform_filter1d(gain_2, size=cf_samples).astype(np.float32)

    # Count how many samples were meaningfully adjusted
    adjusted_1 = int(np.sum(gain_1 < 0.95))
    adjusted_2 = int(np.sum(gain_2 < 0.95))
    total = min_len
    print(
        f"[nightingale:LOG] Voice refinement: stem-1 adjusted {adjusted_1}/{total} "
        f"samples ({100*adjusted_1/total:.1f}%), stem-2 adjusted {adjusted_2}/{total} "
        f"samples ({100*adjusted_2/total:.1f}%)",
        flush=True,
    )

    # Skip refinement if almost nothing changed (the model was already clean)
    if adjusted_1 + adjusted_2 < total * 0.005:
        print("[nightingale:LOG] Stems already clean — skipping refinement",
              flush=True)
        return

    # Apply gain masks
    if stem1_native.ndim == 1:
        stem1_refined = stem1_native * gain_1
        stem2_refined = stem2_native * gain_2
    else:
        # Multichannel: apply same gain to all channels
        stem1_refined = stem1_native * gain_1[np.newaxis, :]
        stem2_refined = stem2_native * gain_2[np.newaxis, :]

    # Write refined stems back (WAV, will be converted to MP3 later)
    sf.write(stem1_path, stem1_refined.T if stem1_refined.ndim > 1 else stem1_refined,
             native_sr)
    sf.write(stem2_path, stem2_refined.T if stem2_refined.ndim > 1 else stem2_refined,
             native_sr)


def refine_singer_stems(stem1_path, stem2_path):
    """Post-process BS Roformer output using voice-signature embeddings.

    This is the main entry point for Stage 2. It:
      1. Computes RMS envelopes for both stems.
      2. Finds "solo windows" where one singer is clearly alone.
      3. Extracts Resemblyzer voice embeddings from those windows.
      4. Uses sliding-window embedding comparison to build a soft mask.
      5. Applies the mask to attenuate leaked audio in overlapping sections.

    If Resemblyzer is not available or the stems are already clean, this
    function is a harmless no-op.
    """
    try:
        from resemblyzer import VoiceEncoder
    except ImportError:
        print("[nightingale:LOG] Resemblyzer not available — skipping voice refinement",
              flush=True)
        return

    progress(65, "Extracting voice signatures for refinement...")

    encoder = VoiceEncoder("cpu")

    # Load both stems as mono 16 kHz for analysis
    wav1_16k = _load_wav_mono(stem1_path, _RESEMBLYZER_SR)
    wav2_16k = _load_wav_mono(stem2_path, _RESEMBLYZER_SR)

    # Compute RMS envelopes
    frame_sec = 0.05
    rms1 = _rms_envelope(wav1_16k, _RESEMBLYZER_SR, frame_sec)
    rms2 = _rms_envelope(wav2_16k, _RESEMBLYZER_SR, frame_sec)

    # Find solo windows for each singer
    solos_1, solos_2 = _find_solo_windows(
        rms1, rms2, frame_sec, _SOLO_MIN_DURATION, _SOLO_ENERGY_RATIO,
    )
    print(
        f"[nightingale:LOG] Found {len(solos_1)} solo window(s) for singer-1, "
        f"{len(solos_2)} for singer-2",
        flush=True,
    )

    # Extract voice signatures
    progress(70, "Computing speaker embeddings...")
    embed_1, embed_2 = _extract_voice_signatures(
        wav1_16k, wav2_16k, solos_1, solos_2, frame_sec, encoder,
    )

    # Check that the two signatures are sufficiently distinct
    similarity = float(np.dot(embed_1, embed_2))
    print(f"[nightingale:LOG] Singer embedding similarity: {similarity:.3f}",
          flush=True)
    if similarity > 0.85:
        print(
            "[nightingale:LOG] Singers sound too similar for embedding refinement "
            f"(sim={similarity:.3f} > 0.85) — skipping",
            flush=True,
        )
        del encoder
        free_gpu()
        return

    # Refine stems using embedding-guided soft masking
    progress(75, "Refining overlapping sections with voice signatures...")
    _refine_with_embeddings(stem1_path, stem2_path, embed_1, embed_2, encoder)

    del encoder
    free_gpu()
    progress(85, "Voice refinement complete")


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------
def run_diarize_pipeline(vocals_path, output_dir, file_hash,
                         device="cpu", models_dir=None, **_kwargs):
    """Full pipeline: iterative separation → voice-signature refinement → metadata.

    Uses a three-pass BS Roformer approach to cleanly separate two singers,
    then optionally refines remaining overlap bleed with voice embeddings.

    Called from server.py when the frontend requests multi-singer analysis.
    The `models_dir` parameter specifies where audio_separator should
    download/cache its model weights.
    """
    if models_dir is None:
        # Fall back to TORCH_HOME parent directory, same as pipeline.py
        torch_home = os.environ.get("TORCH_HOME", "")
        models_dir = os.path.join(
            os.path.dirname(torch_home) if torch_home else output_dir,
            "audio_separator",
        )
        os.makedirs(models_dir, exist_ok=True)

    progress(0, "Starting multi-singer separation...")

    # ── Stages 1–2: Iterative BS Roformer separation ──
    singer_1_path, singer_2_path = separate_singers(
        vocals_path, output_dir, file_hash, models_dir, device,
    )

    # ── Stage 3: Voice-signature refinement ──
    try:
        refine_singer_stems(singer_1_path, singer_2_path)
    except Exception as e:
        # Refinement is best-effort; if it fails, the iterative separation
        # output is still usable (just without voice-signature polish).
        print(f"[nightingale:LOG] Voice refinement failed (non-fatal): {e}",
              flush=True)

    # Verify the outputs exist and have reasonable size
    for p in [singer_1_path, singer_2_path]:
        if not os.path.isfile(p):
            raise RuntimeError(f"Singer stem not found: {p}")
        sz = os.path.getsize(p)
        if sz < 1024:
            raise RuntimeError(
                f"Singer stem suspiciously small ({sz} bytes): {p}"
            )

    metadata = {
        "singer_1_label": "Singer 1",
        "singer_2_label": "Singer 2",
        "swap_references": False,
        "default_multi_singer_mode": True,
        "segments": [],
        "speaker_count": 2,
        "speaker_ids": ["singer_1", "singer_2"],
    }
    meta_path = os.path.join(output_dir, f"{file_hash}_multi_singer.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    progress(95, "Singer separation complete")
    return metadata
