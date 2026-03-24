import { invoke } from '@tauri-apps/api/core';

export const triggerFrontendReady = async (): Promise<void> => {
  return await invoke<void>('frontend_ready');
};
