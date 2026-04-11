/**
 * Tauri bridge for multi-microphone input.
 *
 * Provides slot-based mic capture (up to 4 simultaneous inputs),
 * input device enumeration with channel counts, and per-slot pitch events.
 */

import type { InputDeviceInfo } from "@/types/InputDeviceInfo";
import type { MicSlotConfig } from "@/types/MicSlotConfig";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── Device enumeration ───────────────────────────────────────────────────────

/**
 * List all physical input devices with their maximum channel count.
 * Useful for showing "Device X (32 ch)" in a selector and for computing
 * available input channel indices.
 */
export async function listInputDevices(): Promise<InputDeviceInfo[]> {
  return invoke<InputDeviceInfo[]>("list_input_devices");
}

/**
 * Return all valid 0-indexed input channel indices for a device.
 * E.g. a 32-channel device → [0, 1, 2, …, 31].
 */
export function getAvailableInputChannels(maxChannels: number): number[] {
  return Array.from({ length: maxChannels }, (_, i) => i);
}

/**
 * Human-readable label for a channel index.
 * 0 → "Channel 1", 5 → "Channel 6", etc.
 */
export function formatInputChannel(channel: number): string {
  return `Channel ${channel + 1}`;
}

// ── Slot lifecycle ───────────────────────────────────────────────────────────

/**
 * Start (or update) capture for a specific mic slot.
 * Returns the resolved device name.
 */
export async function startMicSlot(config: MicSlotConfig): Promise<string> {
  return invoke<string>("start_mic_slot", { config });
}

/**
 * Stop capture on a specific slot.
 */
export async function stopMicSlot(slot: number): Promise<void> {
  return invoke("stop_mic_slot", { slot });
}

/**
 * Stop all mic slots at once.
 */
export async function stopAllMicSlots(): Promise<void> {
  return invoke("stop_all_mic_slots");
}

/**
 * Get the running state of each slot: `[true, false, false, false]`.
 */
export async function getMicSlotStatus(): Promise<boolean[]> {
  return invoke<boolean[]>("get_mic_slot_status");
}

// ── Pitch events ─────────────────────────────────────────────────────────────

export interface MicPitchPayload {
  slot: number;
  pitch: number | null;
  /** RMS input level 0.0–1.0 */
  rms: number;
}

/**
 * Subscribe to pitch events from **all** mic slots.
 * The callback receives `{ slot, pitch }` so you can demux per vocalist.
 */
export async function onMicSlotPitch(cb: (payload: MicPitchPayload) => void): Promise<UnlistenFn> {
  return listen<MicPitchPayload>("mic-pitch", (event) => {
    cb(event.payload);
  });
}
