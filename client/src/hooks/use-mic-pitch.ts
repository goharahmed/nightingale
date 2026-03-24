import {
  tauriMicrophoneAdapter,
  type MicrophoneAdapter,
  type StopListening,
} from '@/adapters/microphone';
import type { MicrophoneInfo } from '@/types/MicrophoneInfo';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface MicDevice {
  deviceId: string;
  label: string;
}

const defaultAdapter = tauriMicrophoneAdapter;

export function useMicDevices(adapter: MicrophoneAdapter = defaultAdapter) {
  const [devices, setDevices] = useState<MicDevice[]>([]);

  const refresh = useCallback(async () => {
    try {
      const mics = await adapter.listDevices();
      setDevices(
        mics.map((m: MicrophoneInfo) => ({
          deviceId: m.name,
          label: m.name,
        })),
      );
    } catch {
      setDevices([]);
    }
  }, [adapter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return devices;
}

export function useMicPitch(
  deviceId: string | null,
  enabled: boolean,
  adapter: MicrophoneAdapter = defaultAdapter,
) {
  const [latestPitch, setLatestPitch] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (startedRef.current) {
        adapter.stopCapture().catch(() => {});
        startedRef.current = false;
      }
      setLatestPitch(null);
      setActive(false);
      return;
    }

    let cancelled = false;
    let stopListening: StopListening | null = null;

    const run = async () => {
      let unlisten: StopListening | null = null;
      try {
        unlisten = await adapter.onPitch((pitch) => {
          if (!cancelled) setLatestPitch(pitch);
        });
        if (cancelled) {
          unlisten();
          return;
        }
        stopListening = unlisten;

        if (cancelled) return;

        await adapter.startCapture(deviceId);

        if (cancelled) {
          unlisten();
          await adapter.stopCapture().catch(() => {});
          return;
        }

        startedRef.current = true;
        setActive(true);
        setError(null);
      } catch (e) {
        unlisten?.();
        void adapter.stopCapture().catch(() => {});
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setLatestPitch(null);
          setActive(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      stopListening?.();
      if (startedRef.current) {
        adapter.stopCapture().catch(() => {});
        startedRef.current = false;
      }
      setLatestPitch(null);
      setActive(false);
    };
  }, [enabled, deviceId, adapter]);

  return { latestPitch, active, error };
}
