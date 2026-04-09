/**
 * Web Audio–based playback for instrumental + guide vocals, with a shared
 * rAF tick that notifies subscribers for visuals (background sync, lyrics, HUD).
 * The returned API object is referentially stable across renders when its fields are unchanged.
 *
 * Graph: instrumental buffer → destination; vocals buffer → gain (guide level) → destination.
 * Playback position is derived from AudioContext.currentTime and a (offset, contextTimeAtStart)
 * pair because BufferSourceNode is one-shot: pause/seek recreate sources rather than mutating time.
 */

import type { PlaybackAdapter } from "@/adapters/playback";
import { joinMediaUrl, tauriPlaybackAdapter } from "@/adapters/playback";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TimeSubscriber = (time: number) => void;

export interface AudioPlayer {
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

export function useAudioPlayer(
  fileHash: string,
  initialGuideVolume: number,
  enabled: boolean,
  adapter: PlaybackAdapter = tauriPlaybackAdapter,
): AudioPlayer {
  const ctxRef = useRef<AudioContext | null>(null);
  const instrumentalBufRef = useRef<AudioBuffer | null>(null);
  const vocalsBufRef = useRef<AudioBuffer | null>(null);
  const instrumentalSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const vocalsSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const vocalsGainRef = useRef<GainNode | null>(null);

  // HTML Audio elements for device routing
  const vocalsAudioRef = useRef<HTMLAudioElement | null>(null);
  const instrumentalAudioRef = useRef<HTMLAudioElement | null>(null);
  const vocalsDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const instrumentalDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const rafRef = useRef<number>(0);
  const currentTimeRef = useRef(0);
  const subscribersRef = useRef<Set<TimeSubscriber>>(new Set());
  /** Logical playback position (seconds) when the current sources were started. */
  const startOffsetRef = useRef(0);
  /** ctx.currentTime at the moment the current sources started (anchors wall-clock math). */
  const startContextTimeRef = useRef(0);
  const playingRef = useRef(false);
  /** Set on cleanup so async decode/start and onended ignore stale work after unmount. */
  const cancelledRef = useRef(false);

  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guideVolume, setGuideVolumeState] = useState(initialGuideVolume);

  const getVocalsBuffer = useCallback(() => vocalsBufRef.current, []);

  const getAudioContext = useCallback(() => ctxRef.current, []);

  const getCurrentTime = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !playingRef.current) {
      return currentTimeRef.current;
    }

    return startOffsetRef.current + (ctx.currentTime - startContextTimeRef.current);
  }, []);

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

  const stopSources = useCallback(() => {
    playingRef.current = false;

    try {
      instrumentalSrcRef.current?.stop();
    } catch {
      /* BufferSourceNode throws if stopped twice */
    }
    try {
      vocalsSrcRef.current?.stop();
    } catch {
      /* BufferSourceNode throws if stopped twice */
    }

    instrumentalSrcRef.current = null;
    vocalsSrcRef.current = null;
  }, []);

  const startSources = useCallback(
    (offset: number) => {
      const ctx = ctxRef.current;
      const instBuf = instrumentalBufRef.current;
      const vocBuf = vocalsBufRef.current;
      const gainNode = vocalsGainRef.current;
      const vocalsAudio = vocalsAudioRef.current;
      const instrumentalAudio = instrumentalAudioRef.current;
      const vocalsDestination = vocalsDestinationRef.current;
      const instrumentalDestination = instrumentalDestinationRef.current;

      if (
        !ctx ||
        !instBuf ||
        !vocBuf ||
        !gainNode ||
        !vocalsAudio ||
        !instrumentalAudio ||
        !vocalsDestination ||
        !instrumentalDestination
      ) {
        return;
      }

      stopSources();

      const clamped = Math.max(0, Math.min(offset, instBuf.duration));

      const instSrc = ctx.createBufferSource();
      instSrc.buffer = instBuf;
      instSrc.connect(instrumentalDestination);

      const vocSrc = ctx.createBufferSource();
      vocSrc.buffer = vocBuf;
      vocSrc.connect(gainNode);

      instSrc.onended = () => {
        if (!cancelledRef.current && playingRef.current && instrumentalSrcRef.current === instSrc) {
          playingRef.current = false;

          setIsFinished(true);
          setIsPlaying(false);
        }
      };

      startOffsetRef.current = clamped;
      startContextTimeRef.current = ctx.currentTime;

      instSrc.start(0, clamped);
      vocSrc.start(0, clamped);

      // Start HTML audio elements for output
      vocalsAudio.currentTime = 0;
      instrumentalAudio.currentTime = 0;
      vocalsAudio.play().catch(console.error);
      instrumentalAudio.play().catch(console.error);

      instrumentalSrcRef.current = instSrc;
      vocalsSrcRef.current = vocSrc;
      playingRef.current = true;
    },
    [stopSources],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    cancelledRef.current = false;
    playingRef.current = false;

    startOffsetRef.current = 0;
    startContextTimeRef.current = 0;
    currentTimeRef.current = 0;

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const gainNode = ctx.createGain();
    gainNode.gain.value = Math.max(0, Math.min(1, initialGuideVolume));

    // Create destination nodes for routing to separate devices
    const vocalsDestination = ctx.createMediaStreamDestination();
    const instrumentalDestination = ctx.createMediaStreamDestination();
    gainNode.connect(vocalsDestination);

    vocalsDestinationRef.current = vocalsDestination;
    instrumentalDestinationRef.current = instrumentalDestination;
    vocalsGainRef.current = gainNode;

    // Create HTML audio elements for device routing
    const vocalsAudio = new Audio();
    const instrumentalAudio = new Audio();
    vocalsAudio.srcObject = vocalsDestination.stream;
    instrumentalAudio.srcObject = instrumentalDestination.stream;
    vocalsAudio.volume = 1.0;
    instrumentalAudio.volume = 1.0;

    vocalsAudioRef.current = vocalsAudio;
    instrumentalAudioRef.current = instrumentalAudio;

    const isCancelled = () => cancelled || cancelledRef.current;

    Promise.all([adapter.getMediaBaseUrl(), adapter.getAudioPaths(fileHash)])
      .then(async ([baseUrl, paths]) => {
        if (isCancelled()) {
          return;
        }

        const [instData, vocData] = await Promise.all([
          fetch(joinMediaUrl(baseUrl, paths.instrumental)).then((r) => {
            if (!r.ok) {
              throw new Error(`Failed to fetch instrumental: ${r.status}`);
            }

            return r.arrayBuffer();
          }),

          fetch(joinMediaUrl(baseUrl, paths.vocals)).then((r) => {
            if (!r.ok) {
              throw new Error(`Failed to fetch vocals: ${r.status}`);
            }

            return r.arrayBuffer();
          }),
        ]);

        if (isCancelled()) {
          return;
        }

        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        const [instBuf, vocBuf] = await Promise.all([
          ctx.decodeAudioData(instData),
          ctx.decodeAudioData(vocData),
        ]);

        if (isCancelled()) {
          return;
        }

        instrumentalBufRef.current = instBuf;
        vocalsBufRef.current = vocBuf;

        setDuration(instBuf.duration);

        startSources(0);
        setIsReady(true);
        setIsPlaying(true);
      })
      .catch((e) => {
        if (!isCancelled()) {
          setError(`Failed to load audio: ${e}`);
        }
      });

    let lastNotify = 0;
    const NOTIFY_INTERVAL = 33;

    const tick = () => {
      if (isCancelled()) {
        return;
      }

      if (playingRef.current && ctxRef.current) {
        const now = performance.now();
        const t =
          startOffsetRef.current + (ctxRef.current.currentTime - startContextTimeRef.current);
        currentTimeRef.current = t;

        if (now - lastNotify >= NOTIFY_INTERVAL) {
          lastNotify = now;
          for (const fn of subscribersRef.current) fn(t);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      stopSources();

      // Clean up audio elements
      if (vocalsAudioRef.current) {
        vocalsAudioRef.current.pause();
        vocalsAudioRef.current.srcObject = null;
        vocalsAudioRef.current = null;
      }
      if (instrumentalAudioRef.current) {
        instrumentalAudioRef.current.pause();
        instrumentalAudioRef.current.srcObject = null;
        instrumentalAudioRef.current = null;
      }

      instrumentalBufRef.current = null;
      vocalsBufRef.current = null;
      vocalsGainRef.current = null;
      vocalsDestinationRef.current = null;
      instrumentalDestinationRef.current = null;
      ctx.close();
      ctxRef.current = null;
    };
  }, [adapter, enabled, fileHash, initialGuideVolume, startSources, stopSources]);

  const play = useCallback(() => {
    startSources(startOffsetRef.current);
    setIsPlaying(true);
  }, [startSources]);

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && playingRef.current) {
      startOffsetRef.current += ctx.currentTime - startContextTimeRef.current;
    }

    stopSources();
    setIsPlaying(false);
  }, [stopSources]);

  const resume = useCallback(() => {
    startSources(startOffsetRef.current);
    setIsPlaying(true);
  }, [startSources]);

  const seek = useCallback(
    (time: number) => {
      const wasPlaying = playingRef.current;

      stopSources();

      startOffsetRef.current = time;
      currentTimeRef.current = time;

      if (wasPlaying) {
        startSources(time);
        setIsPlaying(true);
      }

      notifySubscribers(time);
      setIsFinished(false);
    },
    [stopSources, startSources, notifySubscribers],
  );

  const setGuideVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));

    setGuideVolumeState(clamped);

    if (vocalsGainRef.current) {
      vocalsGainRef.current.gain.value = clamped;
    }
  }, []);

  const cleanup = useCallback(() => {
    cancelledRef.current = true;

    cancelAnimationFrame(rafRef.current);

    stopSources();

    // Clean up audio elements
    if (vocalsAudioRef.current) {
      vocalsAudioRef.current.pause();
      vocalsAudioRef.current.srcObject = null;
    }
    if (instrumentalAudioRef.current) {
      instrumentalAudioRef.current.pause();
      instrumentalAudioRef.current.srcObject = null;
    }

    ctxRef.current?.close();
    ctxRef.current = null;
  }, [stopSources]);

  const setVocalsOutputDevice = useCallback(async (deviceId: string) => {
    const audio = vocalsAudioRef.current;
    if (audio && typeof audio.setSinkId === "function") {
      try {
        await audio.setSinkId(deviceId);
      } catch (err) {
        console.error("Failed to set vocals output device:", err);
        throw err;
      }
    }
  }, []);

  const setInstrumentalOutputDevice = useCallback(async (deviceId: string) => {
    const audio = instrumentalAudioRef.current;
    if (audio && typeof audio.setSinkId === "function") {
      try {
        await audio.setSinkId(deviceId);
      } catch (err) {
        console.error("Failed to set instrumental output device:", err);
        throw err;
      }
    }
  }, []);

  return useMemo(
    () => ({
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
    }),
    [
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
    ],
  );
}
