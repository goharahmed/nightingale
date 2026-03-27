import type { MicrophoneInfo } from "@/types/MicrophoneInfo";
import {
  listMicrophones as tauriListMicrophones,
  onMicPitch as tauriOnMicPitch,
  startMicCapture as tauriStartMicCapture,
  stopMicCapture as tauriStopMicCapture,
} from "@/tauri-bridge/microphone";

export type StopListening = () => void;

export interface MicrophoneAdapter {
  listDevices(): Promise<MicrophoneInfo[]>;
  startCapture(preferred: string | null): Promise<string>;
  stopCapture(): Promise<void>;
  onPitch(cb: (pitch: number | null) => void): Promise<StopListening>;
}

export const tauriMicrophoneAdapter: MicrophoneAdapter = {
  listDevices: tauriListMicrophones,
  startCapture: tauriStartMicCapture,
  stopCapture: tauriStopMicCapture,
  onPitch: tauriOnMicPitch,
};
