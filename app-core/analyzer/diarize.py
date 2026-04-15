"""Speaker diarization for multi-singer vocal splitting.

Uses pyannote.audio to detect distinct speakers in the vocals stem,
then generates per-singer audio tracks by masking the waveform at
diarization segment boundaries with smooth crossfades.

Requires a HuggingFace token with access to pyannote/speaker-diarization-3.1.
"""

import json
import os
import subprocess

import numpy as np
import torch
import torchaudio

from whisper_compat import free_gpu, progress

DIARIZATION_MODEL = "pyannote/speaker-diarization-3.1"
CROSSFADE_MS = 30


def _ffmpeg_bin():
    return os.environ.get("FFMPEG_PATH", "ffmpeg")


def _wav_to_mp3(wav_path, mp3_path):
    subprocess.run(
        [_ffmpeg_bin(), "-y", "-i", wav_path,
         "-c:a", "libmp3lame", "-q:a", "2", "-v", "error", mp3_path],
        check=True,
    )
    os.remove(wav_path)


def load_diarization_pipeline(device="cpu", hf_token=None):
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(
        DIARIZATION_MODEL,
        use_auth_token=hf_token,
    )
    # pyannote supports cuda but not mps natively
    effective_device = "cpu" if device == "mps" else device
    pipeline.to(torch.device(effective_device))
    return pipeline


def diarize_vocals(vocals_path, device="cpu", hf_token=None):
    """Run speaker diarization on the vocals stem.

    Returns a list of segments:
        [{"start": float, "end": float, "speaker": str}, ...]
    """
    progress(5, "Loading diarization model...")
    pipeline = load_diarization_pipeline(device, hf_token)

    progress(15, "Running speaker diarization...")
    diarization = pipeline(vocals_path)

    del pipeline
    free_gpu()

    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            "start": round(turn.start, 3),
            "end": round(turn.end, 3),
            "speaker": speaker,
        })

    return segments


def _build_mask(segments, speaker, total_samples, sr):
    """Build a per-speaker amplitude mask with crossfade at edges."""
    mask = torch.zeros(total_samples, dtype=torch.float32)
    crossfade_samples = int(CROSSFADE_MS * sr / 1000)

    for seg in segments:
        if seg["speaker"] != speaker:
            continue
        s = int(seg["start"] * sr)
        e = min(int(seg["end"] * sr), total_samples)
        mask[s:e] = 1.0

    if crossfade_samples < 2:
        return mask

    diff = torch.diff(mask, prepend=torch.tensor([0.0]))
    rises = (diff > 0.5).nonzero(as_tuple=True)[0]
    falls = (diff < -0.5).nonzero(as_tuple=True)[0]

    for idx in rises:
        i = idx.item()
        lo = max(0, i - crossfade_samples)
        if i > lo:
            mask[lo:i] = torch.linspace(0.0, 1.0, i - lo)

    for idx in falls:
        i = idx.item()
        hi = min(total_samples, i + crossfade_samples)
        if hi > i:
            mask[i:hi] = torch.linspace(1.0, 0.0, hi - i)

    return mask


def generate_singer_stems(vocals_path, segments, output_dir, file_hash):
    """Create per-singer audio tracks by masking the vocals stem."""
    progress(60, "Loading vocals for stem generation...")
    wav, sr = torchaudio.load(vocals_path)
    total_samples = wav.shape[1]

    speakers = sorted(set(s["speaker"] for s in segments))

    if len(speakers) == 0:
        raise RuntimeError("Diarization returned no speaker segments")

    if len(speakers) == 1:
        progress(65, "Only one speaker detected — duplicating as fallback")
        speakers.append(speakers[0] + "_dup")

    progress(70, "Generating per-singer masked stems...")
    paths = []
    for i, speaker in enumerate(speakers[:2]):
        mask = _build_mask(segments, speaker, total_samples, sr)
        masked = wav * mask.unsqueeze(0)

        tmp_wav = os.path.join(output_dir, f"{file_hash}_vocals_singer_{i + 1}_tmp.wav")
        mp3_out = os.path.join(output_dir, f"{file_hash}_vocals_singer_{i + 1}.mp3")
        torchaudio.save(tmp_wav, masked, sr)
        _wav_to_mp3(tmp_wav, mp3_out)
        paths.append(mp3_out)
        del masked, mask

    del wav
    free_gpu()
    return paths, speakers[:2]


def run_diarize_pipeline(vocals_path, output_dir, file_hash,
                         device="cpu", hf_token=None):
    """Full pipeline: diarize → generate stems → save metadata.

    Called from server.py when the frontend requests multi-singer analysis.
    """
    segments = diarize_vocals(vocals_path, device, hf_token)

    speaker_count = len(set(s["speaker"] for s in segments))
    progress(55, f"Detected {speaker_count} speaker(s), generating stems...")

    paths, speaker_ids = generate_singer_stems(
        vocals_path, segments, output_dir, file_hash,
    )

    metadata = {
        "singer_1_label": "Singer 1",
        "singer_2_label": "Singer 2",
        "swap_references": False,
        "default_multi_singer_mode": True,
        "segments": segments,
        "speaker_count": speaker_count,
        "speaker_ids": speaker_ids,
    }
    meta_path = os.path.join(output_dir, f"{file_hash}_multi_singer.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    progress(95, "Diarization complete")
    return metadata
