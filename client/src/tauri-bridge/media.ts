import { convertFileSrc as tauriConvertFileSrc } from '@tauri-apps/api/core';

export const convertFileSrc = (path: string): string => {
  return tauriConvertFileSrc(path);
};
