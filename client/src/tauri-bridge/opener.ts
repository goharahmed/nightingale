import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";

export const openUrl = async (url: string): Promise<void> => {
  await tauriOpenUrl(url);
};
