/**
 * Multi-channel audio playback hook using Rust/cpal backend
 * Enables routing vocals and instrumental to specific output channels
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startMultiChannelPlayback,
  stopMultiChannelPlayback,
  seekMultiChannelPlayback,
  getMultiChannelPlaybackPosition,
  getMultiChannelPlaybackDuration,
  isMultiChannelPlaybackActive,
  type MultiChannelConfig,
} from "@/tauri-bridge/multi-channel-audio";
import { getAudioPaths } from "@/tauri-bridge/playback";
import type { TimeSubscriber } from "./use-audio-player";
import { toast } from "sonner";

export interface MultiChannelPlayer {
  getCurrentTime: () => number;
  subscribe: (fn: TimeSubscriber) => () => void;
  duration: number;
  isReady: boolean;
  isPlaying: boolean;
  isFinished: boolean;
  error: string | null;
  guideVolume: number;
  play: () => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  setGuideVolume: (v: number) => void;
  cleanup: () => void;
  getVocalsBuffer: () => AudioBuffer | null;
  getAudioContext: () => AudioContext | null;
  setVocalsOutputDevice: (deviceId: string) => Promise<void>;
  setInstrumentalOutputDevice: (deviceId: string) => Promise<void>;
}

export function useMultiChannelAudioPlayer(
  fileHash: string,
  config: MultiChannelConfig,
  enabled: boolean,
): MultiChannelPlayer {
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [guideVolume, setGuideVolume] = useState(0.3);

  const currentTimeRef = useRef(0);
  const subscribersRef = useRef<Set<TimeSubscriber>>(new Set());
  const positionPollIntervalRef = useRef<number>(0);
  const cancelledRef = useRef(false);

  // Stringify config to use as dependency (avoids object reference issues)
  const configStr = JSON.stringify(config);

  const getCurrentTime = useCallback(() => currentTimeRef.current, []);

  const subscribe = useCallback((fn: TimeSubscriber) => {
    subscribersRef.current.add(fn);
    return () => {
      subscribersRef.current.delete(fn);
    };
  }, []);

  const notifySubscribers = useCallback((t: number) => {
    for (const fn of subscribersRef.current) {
      fn(t);
    }
  }, []);

  // Initialize playback
  useEffect(() => {
    if (!enabled) {
      // Clean up if disabled
      if (positionPollIntervalRef.current) {
        clearInterval(positionPollIntervalRef.current);
        positionPollIntervalRef.current = 0;
      }
      stopMultiChannelPlayback().catch(console.error);
      setIsReady(false);
      setIsPlaying(false);
      return;
    }

    let cancelled = false;
    cancelledRef.current = false;

    const initPlayback = async () => {
      try {
        console.log("[Multi-channel] Initializing playback...");

        // Get audio file paths
        const paths = await getAudioPaths(fileHash);

        if (cancelled || cancelledRef.current) {
          console.log("[Multi-channel] Cancelled during path fetch");
          return;
        }

        console.log("[Multi-channel] Starting playback (this may take 15-30s for decoding)...");

        // Show loading toast
        const loadingToast = toast.loading("Decoding audio files for multi-channel playback...", {
          description: "This may take 15-30 seconds",
        });

        // Start Rust-based playback (this will take time to decode)
        await startMultiChannelPlayback(paths.vocals, paths.instrumental, config);

        toast.dismiss(loadingToast);

        if (cancelled || cancelledRef.current) {
          console.log("[Multi-channel] Cancelled after playback start, stopping...");
          await stopMultiChannelPlayback();
          return;
        }

        console.log("[Multi-channel] Playback started successfully!");

        // Get actual duration from Rust
        const actualDuration = await getMultiChannelPlaybackDuration();
        console.log("[Multi-channel] Duration:", actualDuration, "seconds");
        setDuration(actualDuration);
        setIsReady(true);
        setIsPlaying(true);

        // Start position polling
        const pollInterval = window.setInterval(async () => {
          try {
            const position = await getMultiChannelPlaybackPosition();
            const active = await isMultiChannelPlaybackActive();

            currentTimeRef.current = position;
            notifySubscribers(position);

            if (!active && position > 0) {
              console.log("[Multi-channel] Playback finished");
              setIsPlaying(false);
              setIsFinished(true);
              clearInterval(pollInterval);
            }
          } catch (err) {
            console.error("[Multi-channel] Failed to poll position:", err);
          }
        }, 50); // Poll at 20Hz for smooth updates

        positionPollIntervalRef.current = pollInterval;
      } catch (err) {
        if (!cancelled && !cancelledRef.current) {
          const errorMsg = `Failed to start playback: ${err}`;
          console.error(`[Multi-channel] ${errorMsg}`);
          setError(errorMsg);
          toast.error("Multi-channel playback failed", {
            description: String(err),
          });
        }
      }
    };

    initPlayback();

    return () => {
      console.log("[Multi-channel] Cleanup called");
      cancelled = true;
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fileHash, configStr]);

  const play = useCallback(() => {
    // Resume playback from current position
    setIsPlaying(true);
  }, []);

  const pause = useCallback(async () => {
    await stopMultiChannelPlayback();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const seek = useCallback(
    async (time: number) => {
      try {
        await seekMultiChannelPlayback(time);
        currentTimeRef.current = time;
        notifySubscribers(time);
        setIsFinished(false);
      } catch (err) {
        console.error("Seek failed:", err);
      }
    },
    [notifySubscribers],
  );

  const cleanup = useCallback(() => {
    console.log("[Multi-channel] Manual cleanup called");
    cancelledRef.current = true;
    if (positionPollIntervalRef.current) {
      clearInterval(positionPollIntervalRef.current);
      positionPollIntervalRef.current = 0;
    }
    setIsPlaying(false);
    setIsReady(false);
    stopMultiChannelPlayback().catch(console.error);
  }, []);

  // Stub methods for compatibility with AudioPlayer interface
  const getVocalsBuffer = useCallback(() => null, []);
  const getAudioContext = useCallback(() => null, []);
  const setVocalsOutputDevice = useCallback(async () => {}, []);
  const setInstrumentalOutputDevice = useCallback(async () => {}, []);

  return {
    getCurrentTime,
    subscribe,
    duration,
    isReady,
    isPlaying,
    isFinished,
    error,
    guideVolume,
    play,
    pause,
    resume,
    seek,
    setGuideVolume,
    cleanup,
    getVocalsBuffer,
    getAudioContext,
    setVocalsOutputDevice,
    setInstrumentalOutputDevice,
  };
}
