import { AppConfig } from '@/types/AppConfig';
import { invoke } from '@tauri-apps/api/core';

export const saveConfig = async (config: AppConfig): Promise<void> => {
  return await invoke<void>('save_config', { config });
};
