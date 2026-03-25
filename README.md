<p align="center">
  <img src="client/src/assets/images/logo.png" alt="Nightingale" width="400">
</p>

<p align="center">
  Karaoke from any song in your music library, powered by neural networks.
</p>

---

Nightingale scans your music folder, separates lead vocals from instrumentals using the [UVR Karaoke model](https://github.com/Anjok07/ultimatevocalremovergui) (or [Demucs](https://github.com/facebookresearch/demucs)), transcribes lyrics with word-level timestamps via [WhisperX](https://github.com/m-bain/whisperX), and plays it all back with synchronized highlighting, pitch scoring, profiles, and dynamic backgrounds.

Ships as a single binary. No manual installation of Python, ffmpeg, or ML models required — everything is downloaded and bootstrapped automatically on first launch.

## Features

🎤 **Stem Separation** — isolates lead vocals from instrumentals using the UVR Karaoke model (default) or Demucs, with adjustable guide vocal volume. The karaoke model preserves backing vocals in the instrumental for a more natural sound

📝 **Word-Level Lyrics** — automatic transcription with alignment, or fetched from [LRCLIB](https://lrclib.net) when available

🎯 **Pitch Scoring** — real-time microphone input with pitch detection, star ratings, and per-song scoreboards

👤 **Profiles** — create and switch between player profiles; scores are tracked per profile

🎬 **Video Files** — drop video files (`.mp4`, `.mkv`, etc.) into your music folder; vocals are separated from the audio track and the original video plays as a synchronized background

🌌 **7 Background Themes** — 5 GPU shader backgrounds (Plasma, Aurora, Waves, Nebula, Starfield), Pixabay video backgrounds with 5 flavors (Nature, Underwater, Space, City, Countryside), plus automatic source video playback for video files

🎮 **Gamepad Support** — full navigation and control via gamepad (D-pad, sticks, face buttons)

📺 **Adaptive UI Scaling** — scales to any resolution including 4K TVs

📦 **Self-Contained** — ffmpeg, uv, Python, PyTorch, and ML packages are all downloaded to `~/.nightingale/vendor/` on first run. Video backgrounds are pre-downloaded during setup so the first session is ready to go

## Quick start

Download the latest release for your platform from the [Releases](../../releases) page and run it. On first launch, Nightingale will set up its Python environment and download ML models — this takes a few minutes and shows a progress screen.

### macOS

macOS quarantines files downloaded from the internet. Since Nightingale isn't signed with an Apple Developer ID, Gatekeeper will block it with a message like _"app is damaged and can't be opened"_. To fix this, remove the quarantine attribute after moving the Nightingale.app to Applications:

```bash
xattr -cr /Applications/Nightingale.app
```

### Supported formats

Audio: `.mp3`, `.flac`, `.ogg`, `.wav`, `.m4a`, `.aac`, `.wma`. Video: `.mp4`, `.mkv`, `.avi`, `.webm`, `.mov`, `.m4v`.

## Controls

### Navigation

| Action           | Keyboard       | Gamepad            |
| ---------------- | -------------- | ------------------ |
| Move             | Arrow keys     | D-pad / Left stick |
| Confirm / Select | Enter          | A (South)          |
| Back / Cancel    | Escape         | B (East) / Start   |
| Switch panel     | Tab            | —                  |
| Search songs     | Type to filter | —                  |

### Playback

| Action                  | Keyboard          | Gamepad   |
| ----------------------- | ----------------- | --------- |
| Pause / Resume          | Space             | Start     |
| Exit to menu            | Escape            | B (East)  |
| Toggle guide vocals     | G                 | —         |
| Guide volume up/down    | + / -             | —         |
| Cycle background theme  | T                 | —         |
| Cycle video flavor      | F                 | —         |
| Toggle microphone       | M                 | —         |
| Next microphone         | N                 | —         |
| Toggle fullscreen       | F11               | —         |
| Skip Intro / Skip Outro | On-screen buttons | A (South) |

## How it works

```
Audio or video file
        │
        ▼
  ┌─────────────────┐
  │  UVR Karaoke /  │  ──▶  vocals.mp3 + instrumental.mp3
  │  Demucs         │       (extracts audio track from videos)
  └─────────────────┘
        │
        ▼
  ┌─────────────────┐
  │  LRCLIB         │  ──▶  Fetches synced lyrics if available
  └─────────────────┘
        │
        ▼
  ┌─────────────────┐
  │  WhisperX       │  ──▶  Transcription + word-level alignment
  │  (large-v3)     │
  └─────────────────┘
        │
        ▼
  ┌─────────────────┐
  │  Tauri App      │  ──▶  Plays instrumental + synced lyrics
  │  (Rust + React) │       with pitch scoring & backgrounds
  └─────────────────┘       (video files use source video as background)
```

Analysis results are cached at `~/.nightingale/cache/` using blake3 file hashes. Re-analysis only happens if the source file changes or is manually triggered.

## Hardware

The Python analyzer uses PyTorch and auto-detects the best backend:

| Backend | Device        | Notes                                       |
| ------- | ------------- | ------------------------------------------- |
| CUDA    | NVIDIA GPU    | Fastest                                     |
| MPS     | Apple Silicon | macOS; WhisperX alignment falls back to CPU |
| CPU     | Any           | Slowest but always works                    |

The UVR Karaoke model uses ONNX Runtime and enables CUDA acceleration automatically on NVIDIA GPUs, or CoreML on Apple Silicon.

A song typically takes 2–5 minutes on GPU, 10–20 minutes on CPU.

## Data storage

Everything lives under `~/.nightingale/`:

```
~/.nightingale/
├── cache/              # Stems, transcripts, lyrics per song
├── config.json         # App settings
├── songs.json          # Persisted song library
├── analysis_queue.json # Analysis queue state
├── profiles.json       # Player profiles and scores
├── videos/             # Cached Pixabay video backgrounds
├── sounds/             # Sound effects (celebration)
├── vendor/
│   ├── ffmpeg          # Downloaded ffmpeg binary
│   ├── uv              # Downloaded uv binary
│   ├── python/         # Python 3.10 installed via uv
│   ├── venv/           # Virtual environment with ML packages
│   ├── analyzer/       # Extracted analyzer Python scripts
│   └── .ready          # Marker indicating setup is complete
└── models/
    ├── torch/          # Demucs model cache
    ├── huggingface/    # WhisperX model cache
    └── audio_separator/ # UVR Karaoke model cache
```

### Video backgrounds

Pixabay video backgrounds use the [Pixabay API](https://pixabay.com/api/docs/). The API key is embedded in release builds. For development, create a `.env` file at the project root:

```
PIXABAY_API_KEY=your_key_here
```

## Building from source

### Prerequisites

| Tool       | Version                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| Rust       | 1.85+ (edition 2024)                                                                                                  |
| Node.js    | 20+                                                                                                                   |
| pnpm       | latest                                                                                                                |
| Linux only | `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, `libasound2-dev` |

### Development

```bash
git clone <repo-url> nightingale
cd nightingale
cargo desktop dev
```

### Release build

```bash
cargo desktop build
```

## Supported platforms

| Platform       | Target                      |
| -------------- | --------------------------- |
| Linux x86_64   | `x86_64-unknown-linux-gnu`  |
| Linux aarch64  | `aarch64-unknown-linux-gnu` |
| macOS ARM      | `aarch64-apple-darwin`      |
| macOS Intel    | `x86_64-apple-darwin`       |
| Windows x86_64 | `x86_64-pc-windows-msvc`    |

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
