import { invoke } from '@tauri-apps/api/core';

export const isAppReady = async (): Promise<boolean> => {
  return await invoke<boolean>('is_ready');
};

export const triggerSetup = async (): Promise<void> => {
  return await invoke<void>('trigger_setup');
};
