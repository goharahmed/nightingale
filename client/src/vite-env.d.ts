/// <reference types="vite/client" />

import type { AppConfig } from "./types/AppConfig";
import type { SongsMeta } from "./types/SongsMeta";

declare global {
  interface Window {
    __NIGHTINGALE_APP_CONFIG__?: AppConfig;
    __NIGHTINGALE_SONGS_META__?: SongsMeta;
  }
}

export {};
