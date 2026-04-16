"""Lightweight BPM (beats per minute) estimation using librosa onset/beat tracking."""


def detect_bpm(audio_path: str) -> float | None:
    """Return estimated BPM for the given audio file, or None on failure."""
    try:
        import librosa
        import numpy as np

        y, sr = librosa.load(audio_path, sr=22050, mono=True, duration=120)
        if y is None or len(y) < sr * 2:
            print("[nightingale:LOG] BPM detection: audio too short", flush=True)
            return None

        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(np.atleast_1d(tempo)[0])

        if bpm <= 0:
            return None

        print(f"[nightingale:LOG] BPM detected: {bpm:.1f}", flush=True)
        return round(bpm, 1)
    except Exception as exc:
        print(f"[nightingale:LOG] BPM detection failed: {exc}", flush=True)
        return None
