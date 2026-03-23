import type { AudioPaths } from '@/types/Transcript';
import type { Transcript } from '@/types/Transcript';
import { invoke } from '@tauri-apps/api/core';

export const loadTranscript = async (
  fileHash: string,
): Promise<Transcript> => {
  return await invoke<Transcript>('load_transcript', { fileHash });
};

export const getAudioPaths = async (
  fileHash: string,
): Promise<AudioPaths> => {
  return await invoke<AudioPaths>('get_audio_paths', { fileHash });
};

export const fetchPixabayVideos = async (
  flavor: string,
): Promise<string[]> => {
  return await invoke<string[]>('fetch_pixabay_videos', { flavor });
};

export const getMediaPort = async (): Promise<number> => {
  return await invoke<number>('get_media_port');
};

export const mediaUrl = (port: number, absolutePath: string): string => {
  return `http://127.0.0.1:${port}${absolutePath}`;
};
