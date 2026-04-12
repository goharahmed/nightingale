/**
 * Playback route: requires `song` in location state; otherwise redirects home.
 * When launched from a playlist, location state includes `playlistContext`.
 */

import { useConfig } from "@/queries/use-config";
import type { Song } from "@/types/Song";
import type { PlaylistPlayMode } from "@/types/PlaylistPlayMode";
import { Navigate, useLocation } from "react-router";
import { PlaybackInner } from "./playback-inner";

export interface PlaylistContext {
  playlistId: number;
  playlistName: string;
  songs: Song[];
  currentIndex: number;
  playMode: PlaylistPlayMode;
}

export const Playback = () => {
  const { state } = useLocation();
  const { data: config } = useConfig();

  const typedState = state as { song?: Song; playlistContext?: PlaylistContext } | null;
  const song = typedState?.song;
  const playlistContext = typedState?.playlistContext;

  if (!song) {
    return <Navigate to="/" replace />;
  }

  return (
    <PlaybackInner
      key={song.file_hash}
      song={song}
      config={config ?? null}
      playlistContext={playlistContext}
    />
  );
};
