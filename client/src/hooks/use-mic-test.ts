/**
 * useMicTest – lightweight hook for testing mic input levels from Settings.
 *
 * Starts a temporary capture session (pitch-only, no scoring) and returns
 * the live RMS level so the UI can show a level meter.
 *
 * Call `start()` to begin and `stop()` to end. Automatically cleans up
 * on unmount.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { startMicCapture, stopMicCapture, onMicPitch } from "@/tauri-bridge/microphone";

export function useMicTest() {
  const [testing, setTesting] = useState(false);
  const [rms, setRms] = useState(0);
  const unlistenRef = useRef<(() => void) | null>(null);
  const runningRef = useRef(false);

  const stop = useCallback(async () => {
    unlistenRef.current?.();
    unlistenRef.current = null;
    if (runningRef.current) {
      await stopMicCapture().catch(() => {});
      runningRef.current = false;
    }
    setTesting(false);
    setRms(0);
  }, []);

  const start = useCallback(
    async (deviceName: string | null, inputChannel: number | null) => {
      // Stop any existing session
      await stop();

      try {
        console.log("[mic-test] starting capture:", { deviceName, inputChannel });
        const result = await startMicCapture(
          deviceName,
          { emit_pitch: true, emit_audio: false },
          inputChannel,
        );
        console.log("[mic-test] capture started:", result);
        runningRef.current = true;

        const unlisten = await onMicPitch((_pitch, level) => {
          setRms(level);
        });
        unlistenRef.current = unlisten;
        setTesting(true);
      } catch (e) {
        console.error("[mic-test] start failed:", e);
        setTesting(false);
        setRms(0);
      }
    },
    [stop],
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return { testing, rms, start, stop };
}
