/// <reference types="vite/client" />

import type { AppConfig } from './types/AppConfig';

declare global {
  interface Window {
    __NIGHTINGALE_APP_CONFIG__?: AppConfig;
  }
}

export {};
