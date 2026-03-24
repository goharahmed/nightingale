import type { AudioPaths } from '@/types/Transcript';
import {
  getAudioPaths as tauriGetAudioPaths,
  getMediaPort,
} from '@/tauri-bridge/playback';

export interface PlaybackAdapter {
  getMediaBaseUrl(): Promise<string>;
  getAudioPaths(fileHash: string): Promise<AudioPaths>;
}

export function joinMediaUrl(baseUrl: string, absolutePath: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}${absolutePath}`;
}

export const tauriPlaybackAdapter: PlaybackAdapter = {
  async getMediaBaseUrl() {
    const port = await getMediaPort();
    return `http://127.0.0.1:${port}`;
  },
  getAudioPaths: tauriGetAudioPaths,
};
