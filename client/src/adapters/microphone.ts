import type { MicrophoneInfo } from "@/types/MicrophoneInfo";
import type { InputDeviceInfo } from "@/types/InputDeviceInfo";
import type { MicSlotConfig } from "@/types/MicSlotConfig";
import {
  listMicrophones as tauriListMicrophones,
  onMicPitch as tauriOnMicPitch,
  type MicCaptureOptions,
  startMicCapture as tauriStartMicCapture,
  stopMicCapture as tauriStopMicCapture,
} from "@/tauri-bridge/microphone";
import {
  listInputDevices as tauriListInputDevices,
  startMicSlot as tauriStartMicSlot,
  stopMicSlot as tauriStopMicSlot,
  stopAllMicSlots as tauriStopAllMicSlots,
  getMicSlotStatus as tauriGetMicSlotStatus,
  onMicSlotPitch as tauriOnMicSlotPitch,
  type MicPitchPayload,
} from "@/tauri-bridge/multi-mic";
export type { MicCaptureOptions } from "@/tauri-bridge/microphone";

export type StopListening = () => void;

/** Legacy single-mic adapter (backward-compatible). */
export interface MicrophoneAdapter {
  listDevices(): Promise<MicrophoneInfo[]>;
  startCapture(
    preferred: string | null,
    options: MicCaptureOptions,
    inputChannel?: number | null,
  ): Promise<string>;
  stopCapture(): Promise<void>;
  onPitch(cb: (pitch: number | null, rms: number) => void): Promise<StopListening>;
}

/** Multi-mic adapter for slot-based capture. */
export interface MultiMicAdapter {
  listInputDevices(): Promise<InputDeviceInfo[]>;
  startSlot(config: MicSlotConfig): Promise<string>;
  stopSlot(slot: number): Promise<void>;
  stopAll(): Promise<void>;
  getSlotStatus(): Promise<boolean[]>;
  /** Subscribe to pitch events from all slots. */
  onSlotPitch(cb: (payload: MicPitchPayload) => void): Promise<StopListening>;
}

export const tauriMicrophoneAdapter: MicrophoneAdapter = {
  listDevices: tauriListMicrophones,
  startCapture: tauriStartMicCapture,
  stopCapture: tauriStopMicCapture,
  onPitch: tauriOnMicPitch,
};

export const tauriMultiMicAdapter: MultiMicAdapter = {
  listInputDevices: tauriListInputDevices,
  startSlot: tauriStartMicSlot,
  stopSlot: tauriStopMicSlot,
  stopAll: tauriStopAllMicSlots,
  getSlotStatus: tauriGetMicSlotStatus,
  onSlotPitch: tauriOnMicSlotPitch,
};
