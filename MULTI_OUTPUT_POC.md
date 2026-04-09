# Multi-Output Audio Routing - POC

## Overview
This POC enables routing vocals and instrumental audio to different output devices (e.g., vocals to outputs 1-2, instrumental to outputs 3-4).

## What Was Implemented

### 1. **Configuration (Rust)**
- Added `audio_output_vocals` and `audio_output_instrumental` fields to `AppConfig` in [config.rs](../app-core/src/config.rs)
- These will persist user's preferred output device selections

### 2. **Audio Device Enumeration**
- Created [use-audio-devices.ts](../client/src/hooks/use-audio-devices.ts) hook
- Enumerates available audio output devices using Web Audio API
- Monitors device changes (hotplug/unplug)

### 3. **Multi-Output Audio Player**
- Modified [use-audio-player.ts](../client/src/hooks/use-audio-player.ts) to support routing:
  - Each audio stem (vocals, instrumental) now routes through `MediaStreamAudioDestinationNode`
  - Created HTML Audio elements for each stem
  - Added `setVocalsOutputDevice()` and `setInstrumentalOutputDevice()` methods
  - Uses `HTMLAudioElement.setSinkId()` API to select output device

### 4. **Test UI**
- Created [audio-device-selector.tsx](../client/src/components/playback/audio-device-selector.tsx)
- Appears as an overlay during playback (bottom-left corner)
- Provides dropdowns to select output devices for vocals and instrumental separately

## How to Test

### Prerequisites
- Multiple audio output devices connected to your system
- HTTPS or localhost (required for `setSinkId()` API)

### Testing Steps

1. **Build and run the app:**
   ```bash
   cd client
   pnpm install
   pnpm run dev
   ```

2. **Start playback:**
   - Select a song and start playback
   - Wait for audio to load

3. **Route audio to different devices:**
   - Look for the "🎵 Audio Output Routing (POC)" overlay in the bottom-left
   - Select different devices from the dropdowns:
     - **Vocals Output**: Choose where vocals should play
     - **Instrumental Output**: Choose where instrumental should play
   - Changes apply immediately during playback

4. **Test scenarios:**
   - Route vocals to headphones, instrumental to speakers
   - Route vocals to outputs 1-2, instrumental to outputs 3-4 (if using multi-channel interface)
   - Change devices during playback to verify smooth transitions

## Architecture

### Audio Graph Flow:
```
Vocals Buffer → Gain Node → MediaStreamDestination → HTML Audio (setSinkId) → Device A
Instrumental Buffer → MediaStreamDestination → HTML Audio (setSinkId) → Device B
```

### Synchronization:
- Both audio streams share the same `AudioContext` timing
- Sources start simultaneously with the same offset
- HTML Audio elements play the MediaStreams in sync

## Known Limitations

1. **Browser Support:**
   - `setSinkId()` requires modern browsers (Chrome/Edge/Safari)
   - Requires HTTPS or localhost

2. **Device Labels:**
   - Full device names require microphone permission
   - Without permission, devices show generic labels

3. **Latency:**
   - Different output devices may have different latencies
   - Currently no compensation for latency differences

4. **Device Persistence:**
   - Device IDs are session-specific
   - Config fields added but not yet wired to save/load preferences

## Next Steps (If POC Successful)

1. **Persist device preferences:**
   - Wire config save/load to remember user's device choices
   - Match devices by label/name across sessions

2. **Improve UI:**
   - Move device selector to settings/preferences
   - Show current routing status in HUD
   - Add device connection status indicators

3. **Handle edge cases:**
   - Device disconnect/reconnect during playback
   - Fallback to default if preferred device unavailable
   - Better error handling and user feedback

4. **Latency compensation:**
   - Measure and compensate for device latency differences
   - Ensure perfect synchronization across outputs

5. **Advanced routing:**
   - Support more than 2 outputs (e.g., separate drum stems)
   - Channel mapping (specific channels within a device)
   - Per-song routing profiles

## Alternative: Rust-based Implementation (Option C)

If browser-based routing has limitations, consider:
- Using `cpal` in Rust for direct audio output control
- Full control over hardware channels
- Better performance and lower latency
- More platform-specific but more powerful

## Files Changed/Created

**New Files:**
- `client/src/hooks/use-audio-devices.ts`
- `client/src/components/playback/audio-device-selector.tsx`
- `MULTI_OUTPUT_POC.md` (this file)

**Modified Files:**
- `app-core/src/config.rs`
- `client/src/hooks/use-audio-player.ts`
- `client/src/pages/playback/playback-inner.tsx`
