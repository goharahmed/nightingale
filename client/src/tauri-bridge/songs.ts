import { SongsStore } from '@/types/SongsStore';
import { invoke } from '@tauri-apps/api/core';

export const loadSongs = async (search?: string): Promise<SongsStore> => {
  return await invoke<SongsStore>('load_songs', { search });
};
