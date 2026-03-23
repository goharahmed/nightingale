/**
 * Keeps a ref to the latest app config so partial updates can be persisted
 * without listing `config` in callback dependency arrays.
 */

import { saveConfig } from '@/tauri-bridge/config';
import type { AppConfig } from '@/types/AppConfig';
import { useCallback, useRef } from 'react';

export function usePlaybackConfigPersist(config: AppConfig | null) {
  const configRef = useRef(config);
  configRef.current = config;

  const persistConfig = useCallback((patch: Partial<AppConfig>) => {
    const current = configRef.current;
    if (!current) {
      return;
    }

    saveConfig({ ...current, ...patch });
  }, []);

  return persistConfig;
}
