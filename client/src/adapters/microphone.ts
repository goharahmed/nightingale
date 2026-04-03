import type { MicrophoneInfo } from "@/types/MicrophoneInfo";
import {
  listMicrophones as tauriListMicrophones,
  onMicAudio as tauriOnMicAudio,
  onMicPitch as tauriOnMicPitch,
  type MicAudioEvent,
  type MicCaptureOptions,
  startMicCapture as tauriStartMicCapture,
  stopMicCapture as tauriStopMicCapture,
} from "@/tauri-bridge/microphone";
export type { MicAudioEvent, MicCaptureOptions } from "@/tauri-bridge/microphone";

export type StopListening = () => void;

export interface MicrophoneAdapter {
  listDevices(): Promise<MicrophoneInfo[]>;
  startCapture(preferred: string | null, options: MicCaptureOptions): Promise<string>;
  stopCapture(): Promise<void>;
  onPitch(cb: (pitch: number | null) => void): Promise<StopListening>;
  onAudioChunk(cb: (chunk: MicAudioEvent) => void): Promise<StopListening>;
}

export const tauriMicrophoneAdapter: MicrophoneAdapter = {
  listDevices: tauriListMicrophones,
  startCapture: tauriStartMicCapture,
  stopCapture: tauriStopMicCapture,
  onPitch: tauriOnMicPitch,
  onAudioChunk: tauriOnMicAudio,
};
