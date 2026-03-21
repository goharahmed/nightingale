# Getting Started

## Download

| Platform | Architecture | Link |
|---|---|---|
| Linux | x86_64 | [nightingale-x86_64-unknown-linux-gnu.tar.gz](https://github.com/rzru/nightingale/releases/latest/download/nightingale-x86_64-unknown-linux-gnu.tar.gz) |
| Linux | ARM (aarch64) | [nightingale-aarch64-unknown-linux-gnu.tar.gz](https://github.com/rzru/nightingale/releases/latest/download/nightingale-aarch64-unknown-linux-gnu.tar.gz) |
| macOS | Apple Silicon | [nightingale-aarch64-apple-darwin.tar.gz](https://github.com/rzru/nightingale/releases/latest/download/nightingale-aarch64-apple-darwin.tar.gz) |
| macOS | Intel | [nightingale-x86_64-apple-darwin.tar.gz](https://github.com/rzru/nightingale/releases/latest/download/nightingale-x86_64-apple-darwin.tar.gz) |
| Windows | x86_64 | [nightingale-x86_64-pc-windows-msvc.zip](https://github.com/rzru/nightingale/releases/latest/download/nightingale-x86_64-pc-windows-msvc.zip) |

All releases are also available on the [Releases](https://github.com/rzru/nightingale/releases) page.

Supported audio formats: `.mp3`, `.flac`, `.ogg`, `.wav`, `.m4a`, `.aac`, `.wma`.

Supported video formats: `.mp4`, `.mkv`, `.avi`, `.webm`, `.mov`, `.m4v`.

## macOS: Removing the Quarantine Flag

macOS automatically adds a quarantine attribute to files downloaded from the internet. Since Nightingale is not signed with an Apple Developer ID, Gatekeeper will block it with a message like *"app is damaged and can't be opened"* or *"Apple cannot check it for malicious software"*.

To fix this, remove the quarantine attribute after extracting the archive:

```bash
xattr -cr Nightingale.app
```

This tells macOS to clear (`-c`) all extended attributes recursively (`-r`) from the app bundle, which removes the `com.apple.quarantine` flag that triggers Gatekeeper. The app itself is safe — it's just not code-signed.

## First Launch

On first launch, Nightingale will set up its environment automatically:

1. **Downloads ffmpeg** — needed for audio/video processing
2. **Downloads uv** — Python package manager
3. **Installs Python 3.10** — via uv, isolated from your system Python
4. **Creates virtual environment** — with PyTorch, WhisperX, Demucs, and UVR models
5. **Downloads ML models** — stem separation and transcription models
6. **Pre-downloads video backgrounds** — Pixabay videos for the first session

This process takes a few minutes and shows a progress screen. After setup completes, Nightingale is ready to use.

<!-- TODO: screenshot of the setup/bootstrap progress screen -->
![Setup progress](images/setup.png)

## Adding Music

When prompted, select your music folder. Nightingale will scan it for supported audio and video files. You can change the folder later in the settings.

## Analysis

Before a song can be played as karaoke, it needs to be analyzed:

1. Select a song from the library
2. Analysis runs automatically (stem separation → lyrics → transcription)
3. Results are cached — subsequent plays are instant

You can also queue multiple songs for batch analysis.

<!-- TODO: screenshot of the song library with a mix of analyzed/queued/not-analyzed songs -->
![Song library](images/library.png)

## Force Re-setup

If something goes wrong with the vendor environment, you can force a fresh setup:

```bash
nightingale --setup
```
