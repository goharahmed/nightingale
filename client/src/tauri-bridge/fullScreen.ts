import { getCurrentWindow } from "@tauri-apps/api/window";

import { windowImmersive } from "@/tauri-bridge/window";

// Lazy initialization - only get window when in Tauri context
let win: ReturnType<typeof getCurrentWindow> | null = null;

const getWindow = () => {
  if (!win && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    win = getCurrentWindow();
  }
  return win;
};

export const isFullScreen = (): Promise<boolean> => {
  return windowImmersive();
};

export const setFullScreen = (isFullScreen: boolean) => {
  const window = getWindow();
  if (!window) {
    return Promise.resolve(); // Gracefully handle browser context
  }
  return window.setSimpleFullscreen(isFullScreen);
};
