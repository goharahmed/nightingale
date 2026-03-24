import { getCurrentWindow } from '@tauri-apps/api/window';

const win = getCurrentWindow();

export const isFullScreen = (): Promise<boolean> => {
  return win.isFullscreen();
};

export const setFullScreen = (isFullScreen: boolean) => {
  return win.setSimpleFullscreen(isFullScreen);
};
