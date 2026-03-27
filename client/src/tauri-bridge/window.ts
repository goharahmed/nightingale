import { invoke } from "@tauri-apps/api/core";

export const triggerFrontendReady = async (): Promise<void> => {
  return await invoke<void>("frontend_ready");
};

export const windowImmersive = (): Promise<boolean> => {
  return invoke<boolean>("window_immersive");
};

export const minimizeWindow = (): Promise<void> => {
  return invoke<void>("minimize_window");
};
