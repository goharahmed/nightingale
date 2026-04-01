import { invoke } from "@tauri-apps/api/core";
import type { LibraryMenuFilters } from "@/types/LibraryMenuFilters";

export const enqueueOne = async (fileHash: string): Promise<void> => {
  return await invoke<void>("enqueue_one", { fileHash });
};

export const enqueueAll = async (filters: LibraryMenuFilters): Promise<void> => {
  return await invoke<void>("enqueue_all", { filters });
};

export const deleteSongCache = async (fileHash: string): Promise<void> => {
  return await invoke<void>("delete_song_cache", { fileHash });
};

export const reanalyzeTranscript = async (fileHash: string, language?: string): Promise<void> => {
  return await invoke<void>("reanalyze_transcript", { fileHash, language });
};

export const reanalyzeFull = async (fileHash: string): Promise<void> => {
  return await invoke<void>("reanalyze_full", { fileHash });
};
