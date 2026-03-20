import { exit as tauriExit } from '@tauri-apps/plugin-process';

export const exit = async (exitCode: 0 | 1 = 0) => {
  await tauriExit(exitCode);
};
