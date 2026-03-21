import { invoke } from '@tauri-apps/api/core';

export const enqueueOne = async (fileHash: string): Promise<void> => {
  return await invoke<void>('enqueue_one', { fileHash });
};

export const enqueueAll = async (): Promise<void> => {
  return await invoke<void>('enqueue_all');
};

export const deleteSongCache = async (fileHash: string): Promise<void> => {
  return await invoke<void>('delete_song_cache', { fileHash });
};

export const reanalyzeTranscript = async (fileHash: string): Promise<void> => {
  return await invoke<void>('reanalyze_transcript', { fileHash });
};
export const reanalyzeFull = async (fileHash: string): Promise<void> => {
  return await invoke<void>('reanalyze_full', { fileHash });
};
