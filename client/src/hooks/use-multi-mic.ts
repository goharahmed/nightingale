/**
 * useMultiMic – manages 1-4 simultaneous microphone inputs with
 * independent capture, pitch tracking, and per-slot state.
 *
 * Designed to be a drop-in upgrade path from the legacy single-mic hooks.
 * When `slotCount` is 1, behaviour is equivalent to the original single-mic flow
 * but routed through the slot-based Rust backend.
 */

import {
  tauriMultiMicAdapter,
  type MultiMicAdapter,
  type StopListening,
} from "@/adapters/microphone";
import type { InputDeviceInfo } from "@/types/InputDeviceInfo";
import type { MicSlotConfig } from "@/types/MicSlotConfig";
import type { MicPitchPayload } from "@/tauri-bridge/multi-mic";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MicSlotState {
  /** 0-indexed slot id */
  slot: number;
  /** Latest detected pitch (Hz) or null */
  pitch: number | null;
  /** RMS input level 0.0–1.0 */
  rms: number;
  /** Whether the capture stream is running */
  active: boolean;
  /** Error message, if any */
  error: string | null;
}

export interface UseMultiMicOptions {
  /** How many slots to activate (1-4). */
  slotCount: number;
  /** Per-slot configuration: device name, input channel. Length should match slotCount. */
  slotConfigs: Array<{
    deviceName: string | null;
    inputChannel: number | null;
  }>;
  /** Master enable switch. When false, all slots are stopped. */
  enabled: boolean;
  /** Whether to emit pitch events. */
  emitPitch: boolean;
  /** Whether to emit audio for monitoring. */
  emitAudio: boolean;
  /** Adapter override (default: tauriMultiMicAdapter) */
  adapter?: MultiMicAdapter;
}

const MAX_SLOTS = 4;

function makeEmptySlot(slot: number): MicSlotState {
  return { slot, pitch: null, rms: 0, active: false, error: null };
}

// ── Hook: input device list ──────────────────────────────────────────────────

export function useInputDevices(adapter: MultiMicAdapter = tauriMultiMicAdapter) {
  const [devices, setDevices] = useState<InputDeviceInfo[]>([]);

  const refresh = useCallback(async () => {
    try {
      setDevices(await adapter.listInputDevices());
    } catch {
      setDevices([]);
    }
  }, [adapter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { devices, refresh };
}

// ── Hook: multi-mic capture + pitch ──────────────────────────────────────────

export function useMultiMic({
  slotCount,
  slotConfigs,
  enabled,
  emitPitch,
  emitAudio,
  adapter = tauriMultiMicAdapter,
}: UseMultiMicOptions) {
  const clampedCount = Math.max(0, Math.min(slotCount, MAX_SLOTS));

  const [slots, setSlots] = useState<MicSlotState[]>(() =>
    Array.from({ length: MAX_SLOTS }, (_, i) => makeEmptySlot(i)),
  );

  const startedRef = useRef<Set<number>>(new Set());
  const pitchUnlistenRef = useRef<StopListening | null>(null);

  // ── Subscribe to pitch events (all slots, one listener) ────────────────
  useEffect(() => {
    if (!enabled || !emitPitch) {
      // Clear pitches and levels
      setSlots((prev) =>
        prev.map((s) => (s.pitch !== null || s.rms !== 0 ? { ...s, pitch: null, rms: 0 } : s)),
      );
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const unlisten = await adapter.onSlotPitch((payload: MicPitchPayload) => {
          if (cancelled) return;
          setSlots((prev) => {
            const next = [...prev];
            if (payload.slot < next.length) {
              next[payload.slot] = {
                ...next[payload.slot],
                pitch: payload.pitch,
                rms: payload.rms,
              };
            }
            return next;
          });
        });

        if (cancelled) {
          unlisten();
          return;
        }
        pitchUnlistenRef.current = unlisten;
      } catch {
        // noop – pitch subscription failed
      }
    };

    void run();

    return () => {
      cancelled = true;
      pitchUnlistenRef.current?.();
      pitchUnlistenRef.current = null;
    };
  }, [enabled, emitPitch, adapter]);

  // ── Start / stop capture slots ─────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      // Stop all running slots
      for (const slot of startedRef.current) {
        adapter.stopSlot(slot).catch(() => {});
      }
      startedRef.current.clear();
      setSlots((prev) => prev.map((s) => ({ ...s, active: false, pitch: null, error: null })));
      return;
    }

    let cancelled = false;

    const startSlots = async () => {
      const desiredSlots = new Set<number>();
      for (let i = 0; i < clampedCount; i++) {
        desiredSlots.add(i);
      }

      // Stop slots that are no longer needed
      for (const slot of startedRef.current) {
        if (!desiredSlots.has(slot)) {
          await adapter.stopSlot(slot).catch(() => {});
          startedRef.current.delete(slot);
          if (!cancelled) {
            setSlots((prev) => {
              const next = [...prev];
              next[slot] = { ...next[slot], active: false, pitch: null, error: null };
              return next;
            });
          }
        }
      }

      // Start new slots
      for (let i = 0; i < clampedCount; i++) {
        const cfg = slotConfigs[i] ?? { deviceName: null, inputChannel: null };
        const slotConfig: MicSlotConfig = {
          slot: i,
          device_name: cfg.deviceName,
          input_channel: cfg.inputChannel,
          options: { emit_pitch: emitPitch, emit_audio: emitAudio },
        };

        try {
          await adapter.startSlot(slotConfig);
          startedRef.current.add(i);
          if (!cancelled) {
            setSlots((prev) => {
              const next = [...prev];
              next[i] = { ...next[i], active: true, error: null };
              return next;
            });
          }
        } catch (e) {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : String(e);
            setSlots((prev) => {
              const next = [...prev];
              next[i] = { ...next[i], active: false, error: msg };
              return next;
            });
          }
        }
      }
    };

    void startSlots();

    return () => {
      cancelled = true;
      for (const slot of startedRef.current) {
        adapter.stopSlot(slot).catch(() => {});
      }
      startedRef.current.clear();
    };
    // Note: we stringify slotConfigs to avoid infinite re-render loops from object identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, clampedCount, emitPitch, emitAudio, JSON.stringify(slotConfigs), adapter]);

  return {
    /** Per-slot state (always length 4; check `.active` to see which are live). */
    slots,
    /** Active slot count. */
    activeCount: clampedCount,
  };
}
