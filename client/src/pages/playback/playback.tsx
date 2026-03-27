/**
 * Playback route: requires `song` in location state; otherwise redirects home.
 */

import { useConfig } from "@/queries/use-config";
import type { Song } from "@/types/Song";
import { Navigate, useLocation } from "react-router";
import { PlaybackInner } from "./playback-inner";

export const Playback = () => {
  const { state } = useLocation();
  const { data: config } = useConfig();

  const typedState = state as { song?: Song } | null;
  const song = typedState?.song;

  if (!song) {
    return <Navigate to="/" replace />;
  }

  return <PlaybackInner key={song.file_hash} song={song} config={config ?? null} />;
};
