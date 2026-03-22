import type { AnalysisQueue } from '@/types/AnalysisQueue';
import type { SongsMeta } from '@/types/SongsMeta';
import type { SongsStore } from '@/types/SongsStore';
import { invoke } from '@tauri-apps/api/core';

export const loadSongs = async (
  search?: string,
  skip = 0,
  take = 50,
): Promise<SongsStore> => {
  return await invoke<SongsStore>('load_songs', { search, skip, take });
};

export const loadSongsMeta = async (): Promise<SongsMeta> => {
  return await invoke<SongsMeta>('load_songs_meta');
};

export const loadAnalysisQueue = async (): Promise<AnalysisQueue> => {
  return await invoke<AnalysisQueue>('load_analysis_queue');
};
