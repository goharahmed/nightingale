import { getCurrentWindow } from '@tauri-apps/api/window';

import { windowImmersive } from '@/tauri-bridge/window';

const win = getCurrentWindow();

export const isFullScreen = (): Promise<boolean> => {
  return windowImmersive();
};

export const setFullScreen = (isFullScreen: boolean) => {
  return win.setSimpleFullscreen(isFullScreen);
};
