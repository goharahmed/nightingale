import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { SetupProgress } from '@/types/SetupProgress';

export const isAppReady = async (): Promise<boolean> => {
  return await invoke<boolean>('is_ready');
};

export const triggerSetup = async (): Promise<void> => {
  return await invoke<void>('trigger_setup');
};

export const onSetupProgress = async (
  cb: (progress: SetupProgress) => void,
): Promise<() => void> => {
  return await listen<SetupProgress>('setup-progress', ({ payload }) =>
    cb(payload),
  );
};

export const onSetupError = async (
  cb: (error: string) => void,
): Promise<() => void> => {
  return await listen<string>('setup-error', ({ payload }) => cb(payload));
};
