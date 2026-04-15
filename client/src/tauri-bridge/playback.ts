import type { AudioPaths } from "@/types/Transcript";
import type { Transcript } from "@/types/Transcript";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const loadTranscript = async (fileHash: string): Promise<Transcript> => {
  return await invoke<Transcript>("load_transcript", { fileHash });
};

export const loadTranscriptVariant = async (
  fileHash: string,
  script: string,
): Promise<Transcript> => {
  return await invoke<Transcript>("load_transcript_variant", { fileHash, script });
};

export const getTranscriptVariants = async (fileHash: string): Promise<string[]> => {
  return await invoke<string[]>("get_transcript_variants", { fileHash });
};

export const saveTranscript = async (fileHash: string, transcript: Transcript): Promise<void> => {
  return await invoke<void>("save_transcript", { fileHash, transcript });
};

export const getAudioPaths = async (fileHash: string): Promise<AudioPaths> => {
  return await invoke<AudioPaths>("get_audio_paths", { fileHash });
};

export interface MultiSingerAudioPaths {
  instrumental: string;
  singer_1: string;
  singer_2: string;
}

export interface DiarizationSegment {
  start: number;
  end: number;
  speaker: string;
}

export interface MultiSingerMetadata {
  singer_1_label: string;
  singer_2_label: string;
  swap_references: boolean;
  default_multi_singer_mode: boolean;
  segments?: DiarizationSegment[] | null;
  speaker_count?: number | null;
  speaker_ids?: string[] | null;
}

export const getMultiSingerAudioPaths = async (
  fileHash: string,
): Promise<MultiSingerAudioPaths | null> => {
  return await invoke<MultiSingerAudioPaths | null>("get_multi_singer_audio_paths", { fileHash });
};

export const loadMultiSingerMetadata = async (
  fileHash: string,
): Promise<MultiSingerMetadata | null> => {
  return await invoke<MultiSingerMetadata | null>("load_multi_singer_metadata", { fileHash });
};

export const saveMultiSingerMetadata = async (
  fileHash: string,
  metadata: MultiSingerMetadata,
): Promise<void> => {
  return await invoke("save_multi_singer_metadata", { fileHash, metadata });
};

export const ensureMp3Stems = (fileHash: string): void => {
  void invoke<void>("ensure_mp3_stems", { fileHash });
};

export const ensurePlayableSourceVideo = async (fileHash: string): Promise<string | null> => {
  return await invoke<string | null>("ensure_playable_source_video", { fileHash });
};

export interface StemsReadyEvent {
  file_hash: string;
  error: string | null;
}

export const onStemsReady = async (cb: (event: StemsReadyEvent) => void): Promise<UnlistenFn> => {
  return await listen<StemsReadyEvent>("stems-ready", ({ payload }) => cb(payload));
};

export const fetchPixabayVideos = async (flavor: string): Promise<string[]> => {
  return await invoke<string[]>("fetch_pixabay_videos", { flavor });
};

export const getMediaPort = async (): Promise<number> => {
  return await invoke<number>("get_media_port");
};

export interface PixabayVideoDownloaded {
  flavor: string;
  path: string;
  evictedPath?: string;
}

export const onPixabayVideoDownloaded = async (
  cb: (event: PixabayVideoDownloaded) => void,
): Promise<UnlistenFn> => {
  return await listen<{ flavor: string; path: string; evicted_path: string | null }>(
    "pixabay-video-downloaded",
    ({ payload }) =>
      cb({
        flavor: payload.flavor,
        path: payload.path,
        evictedPath: payload.evicted_path ?? undefined,
      }),
  );
};
