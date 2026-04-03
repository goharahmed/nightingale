import {
  tauriMicrophoneAdapter,
  type MicrophoneAdapter,
  type StopListening,
} from "@/adapters/microphone";
import { useEffect, useRef, useState } from "react";

const defaultAdapter = tauriMicrophoneAdapter;
const MONITOR_GAIN = 0.65;
const START_DELAY_SEC = 0.01;
const MAX_SCHEDULE_LEAD_SEC = 0.08;

export function useMicMonitor(enabled: boolean, adapter: MicrophoneAdapter = defaultAdapter) {
  const [error, setError] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextStartRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setError(null);
      return;
    }

    let cancelled = false;
    let unlisten: StopListening | null = null;

    const run = async () => {
      try {
        const ctx = new AudioContext({ latencyHint: "interactive" });
        await ctx.resume();

        if (cancelled) {
          await ctx.close().catch(() => {});
          return;
        }

        const gain = ctx.createGain();
        gain.gain.value = MONITOR_GAIN;
        gain.connect(ctx.destination);

        ctxRef.current = ctx;
        gainRef.current = gain;
        nextStartRef.current = 0;

        unlisten = await adapter.onAudioChunk((chunk) => {
          const activeCtx = ctxRef.current;
          const activeGain = gainRef.current;
          if (!activeCtx || !activeGain || chunk.samples.length === 0) {
            return;
          }

          const buffer = activeCtx.createBuffer(1, chunk.samples.length, chunk.sample_rate);
          buffer.copyToChannel(Float32Array.from(chunk.samples), 0);

          const source = activeCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(activeGain);

          const now = activeCtx.currentTime;
          if (nextStartRef.current < now || nextStartRef.current > now + MAX_SCHEDULE_LEAD_SEC) {
            nextStartRef.current = now + START_DELAY_SEC;
          }
          source.start(nextStartRef.current);
          nextStartRef.current += buffer.duration;
        });

        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      unlisten?.();
      gainRef.current?.disconnect();
      gainRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      nextStartRef.current = 0;
      if (ctx) {
        void ctx.close().catch(() => {});
      }
    };
  }, [enabled, adapter]);

  return { error };
}
