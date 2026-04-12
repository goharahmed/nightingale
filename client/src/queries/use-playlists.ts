import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PLAYLISTS, SONGS } from "./keys";
import {
  getPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  setPlaylistPlayMode,
  addSongToPlaylist,
  removeSongFromPlaylist,
  reorderPlaylistSongs,
} from "@/tauri-bridge/playlist";
import { useCurrentProfile } from "@/hooks/use-current-profile";
import type { PlaylistPlayMode } from "@/types/PlaylistPlayMode";
import { toast } from "sonner";

export const usePlaylists = () => {
  const profile = useCurrentProfile();

  return useQuery({
    queryKey: [...PLAYLISTS, profile],
    queryFn: () => getPlaylists(profile!),
    enabled: !!profile,
  });
};

export const useCreatePlaylist = () => {
  const queryClient = useQueryClient();
  const profile = useCurrentProfile();

  return useMutation({
    mutationFn: (name: string) => createPlaylist(profile!, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS });
    },
    onError: (error: unknown) => {
      toast.error(
        `Failed to create playlist: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    },
  });
};

export const useRenamePlaylist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playlistId, name }: { playlistId: number; name: string }) =>
      renamePlaylist(playlistId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS });
    },
    onError: (error: unknown) => {
      toast.error(
        `Failed to rename playlist: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    },
  });
};

export const useDeletePlaylist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playlistId: number) => deletePlaylist(playlistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS });
    },
    onError: (error: unknown) => {
      toast.error(
        `Failed to delete playlist: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    },
  });
};

export const useSetPlaylistPlayMode = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playlistId, mode }: { playlistId: number; mode: PlaylistPlayMode }) =>
      setPlaylistPlayMode(playlistId, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS });
    },
  });
};

export const useAddSongToPlaylist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playlistId, fileHash }: { playlistId: number; fileHash: string }) =>
      addSongToPlaylist(playlistId, fileHash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS });
      queryClient.invalidateQueries({ queryKey: SONGS });
    },
    onError: (error: unknown) => {
      toast.error(
        `Failed to add song to playlist: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    },
  });
};

export const useRemoveSongFromPlaylist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playlistId, fileHash }: { playlistId: number; fileHash: string }) =>
      removeSongFromPlaylist(playlistId, fileHash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYLISTS });
      queryClient.invalidateQueries({ queryKey: SONGS });
    },
    onError: (error: unknown) => {
      toast.error(
        `Failed to remove song from playlist: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    },
  });
};

export const useReorderPlaylistSongs = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playlistId, fileHashes }: { playlistId: number; fileHashes: string[] }) =>
      reorderPlaylistSongs(playlistId, fileHashes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SONGS });
    },
    onError: (error: unknown) => {
      toast.error(
        `Failed to reorder playlist: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    },
  });
};
