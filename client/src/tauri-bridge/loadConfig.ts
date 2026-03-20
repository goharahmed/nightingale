import { AppConfig } from '@/types/AppConfig';
import { invoke } from '@tauri-apps/api/core';

export const loadConfig = async (): Promise<AppConfig> => {
  return await invoke<AppConfig>('load_config');
};
