import type { PlaylistPlayMode } from "./PlaylistPlayMode";

export type Playlist = {
  id: number;
  profile: string;
  name: string;
  play_mode: PlaylistPlayMode;
  song_count: number;
};
