/**
 * Multi-channel audio output bridge for Rust/cpal-based playback
 * Enables routing audio to specific output channels within a device
 */

import { invoke } from "@tauri-apps/api/core";

export interface AudioOutputDevice {
  name: string;
  maxChannels: number;
}

export interface ChannelRouting {
  deviceName: string;
  startChannel: number; // 0-indexed: 0 = channels 1-2, 2 = channels 3-4, etc.
}

export interface MultiChannelConfig {
  vocalsRouting: ChannelRouting;
  instrumentalRouting: ChannelRouting;
}

/**
 * Get list of all available audio output devices with their channel counts
 * This reveals multi-channel devices like audio interfaces
 */
export async function getAudioOutputDevices(): Promise<AudioOutputDevice[]> {
  return invoke<AudioOutputDevice[]>("get_audio_output_devices");
}

/**
 * Format channel index to human-readable string
 * e.g., 0 → "Channels 1-2", 2 → "Channels 3-4"
 */
export function formatChannelPair(startChannel: number): string {
  const start = startChannel + 1;
  const end = startChannel + 2;
  return `Channels ${start}-${end}`;
}

/**
 * Get all available channel pairs for a device
 * e.g., 32-channel device returns: [0, 2, 4, 6, ..., 30]
 */
export function getAvailableChannelPairs(maxChannels: number): number[] {
  const pairs: number[] = [];
  for (let i = 0; i < maxChannels - 1; i += 2) {
    pairs.push(i);
  }
  return pairs;
}

/**
 * Start multi-channel playback with specific channel routing
 */
export async function startMultiChannelPlayback(
  vocalsPath: string,
  instrumentalPath: string,
  config: MultiChannelConfig,
): Promise<void> {
  return invoke("start_multi_channel_playback", {
    vocalsPath,
    instrumentalPath,
    config,
  });
}

/**
 * Pause multi-channel playback (keeps streams alive, outputs silence)
 */
export async function pauseMultiChannelPlayback(): Promise<void> {
  return invoke("pause_multi_channel_playback");
}

/**
 * Resume multi-channel playback after a pause
 */
export async function resumeMultiChannelPlayback(): Promise<void> {
  return invoke("resume_multi_channel_playback");
}

/**
 * Stop multi-channel playback (tears down streams completely)
 */
export async function stopMultiChannelPlayback(): Promise<void> {
  return invoke("stop_multi_channel_playback");
}

/**
 * Seek to a specific time in the playback
 */
export async function seekMultiChannelPlayback(time: number): Promise<void> {
  return invoke("seek_multi_channel_playback", { time });
}

/**
 * Get current playback position in seconds
 */
export async function getMultiChannelPlaybackPosition(): Promise<number> {
  return invoke("get_multi_channel_playback_position");
}

/**
 * Check if multi-channel playback is currently active
 */
export async function isMultiChannelPlaybackActive(): Promise<boolean> {
  return invoke("is_multi_channel_playback_active");
}

/**
 * Get total duration of the currently loaded audio in seconds
 */
export async function getMultiChannelPlaybackDuration(): Promise<number> {
  return invoke("get_multi_channel_playback_duration");
}
