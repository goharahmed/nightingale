import { invoke } from "@tauri-apps/api/core";
import type { Playlist } from "@/types/Playlist";
import type { PlaylistPlayMode } from "@/types/PlaylistPlayMode";

export const getPlaylists = async (profile: string): Promise<Playlist[]> => {
  return await invoke<Playlist[]>("get_playlists", { profile });
};

export const createPlaylist = async (profile: string, name: string): Promise<Playlist> => {
  return await invoke<Playlist>("create_playlist", { profile, name });
};

export const renamePlaylist = async (playlistId: number, name: string): Promise<void> => {
  return await invoke<void>("rename_playlist", { playlistId, name });
};

export const deletePlaylist = async (playlistId: number): Promise<void> => {
  return await invoke<void>("delete_playlist", { playlistId });
};

export const setPlaylistPlayMode = async (
  playlistId: number,
  mode: PlaylistPlayMode,
): Promise<void> => {
  return await invoke<void>("set_playlist_play_mode", { playlistId, mode });
};

export const addSongToPlaylist = async (playlistId: number, fileHash: string): Promise<void> => {
  return await invoke<void>("add_song_to_playlist", { playlistId, fileHash });
};

export const removeSongFromPlaylist = async (
  playlistId: number,
  fileHash: string,
): Promise<void> => {
  return await invoke<void>("remove_song_from_playlist", { playlistId, fileHash });
};

export const reorderPlaylistSongs = async (
  playlistId: number,
  fileHashes: string[],
): Promise<void> => {
  return await invoke<void>("reorder_playlist_songs", { playlistId, fileHashes });
};

export const getPlaylistSongHashes = async (playlistId: number): Promise<string[]> => {
  return await invoke<string[]>("get_playlist_song_hashes", { playlistId });
};
