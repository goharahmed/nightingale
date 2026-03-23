import {
  getAudioPaths,
  getMediaPort,
  mediaUrl,
} from '@/tauri-bridge/playback';
import { useCallback, useEffect, useRef, useState } from 'react';

function amplitudeToVolume(amp: number): number {
  return Math.max(0, Math.min(1, amp));
}

export type TimeSubscriber = (time: number) => void;

export interface AudioPlayer {
  getCurrentTime: () => number;
  subscribe: (fn: TimeSubscriber) => () => void;
  duration: number;
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
}

export function useAudioPlayer(
  fileHash: string,
  initialGuideVolume: number,
): AudioPlayer {
  const instrumentalRef = useRef<HTMLAudioElement | null>(null);
  const vocalsRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const currentTimeRef = useRef(0);
  const subscribersRef = useRef<Set<TimeSubscriber>>(new Set());
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guideVolume, setGuideVolumeState] = useState(initialGuideVolume);
  const readyCountRef = useRef(0);
  const startedRef = useRef(false);

  const getCurrentTime = useCallback(() => currentTimeRef.current, []);

  const subscribe = useCallback((fn: TimeSubscriber) => {
    subscribersRef.current.add(fn);
    return () => {
      subscribersRef.current.delete(fn);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const instrumental = new Audio();
    const vocals = new Audio();
    instrumentalRef.current = instrumental;
    vocalsRef.current = vocals;
    readyCountRef.current = 0;
    startedRef.current = false;

    const tryStart = () => {
      readyCountRef.current++;
      if (readyCountRef.current >= 2 && !startedRef.current && !cancelled) {
        startedRef.current = true;
        setDuration(instrumental.duration || 0);
        instrumental.play().catch((e) => {
          if (!cancelled) setError(`Playback failed: ${e.message}`);
        });
        vocals.play().catch(() => {});
        setIsPlaying(true);
      }
    };

    const handleError = (label: string) => () => {
      if (cancelled) return;
      const code = instrumental.error?.code ?? vocals.error?.code;
      const messages: Record<number, string> = {
        1: 'Playback aborted',
        2: 'Network error loading audio',
        3: 'Audio decoding failed — GStreamer plugins may be missing (install gst-plugins-good)',
        4: 'Audio format not supported',
      };
      setError(messages[code ?? 0] ?? `Failed to load ${label} audio`);
    };

    instrumental.addEventListener('canplaythrough', tryStart, { once: true });
    vocals.addEventListener('canplaythrough', tryStart, { once: true });

    instrumental.addEventListener('error', handleError('instrumental'), {
      once: true,
    });
    vocals.addEventListener('error', handleError('vocals'), { once: true });

    instrumental.addEventListener('ended', () => {
      if (!cancelled) {
        setIsFinished(true);
        setIsPlaying(false);
      }
    });

    Promise.all([getMediaPort(), getAudioPaths(fileHash)])
      .then(([port, paths]) => {
        if (cancelled) return;
        instrumental.src = mediaUrl(port, paths.instrumental);
        vocals.src = mediaUrl(port, paths.vocals);
        vocals.volume = amplitudeToVolume(initialGuideVolume);
        instrumental.load();
        vocals.load();
      })
      .catch((e) => {
        if (!cancelled) setError(`Failed to load audio: ${e}`);
      });

    let lastNotify = 0;
    const NOTIFY_INTERVAL = 33; // ~30fps
    const tick = () => {
      if (instrumentalRef.current && !cancelled) {
        const t = instrumentalRef.current.currentTime;
        currentTimeRef.current = t;
        const now = performance.now();
        if (now - lastNotify >= NOTIFY_INTERVAL) {
          lastNotify = now;
          for (const fn of subscribersRef.current) {
            fn(t);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      instrumental.pause();
      vocals.pause();
      instrumental.src = '';
      vocals.src = '';
      instrumentalRef.current = null;
      vocalsRef.current = null;
    };
  }, [fileHash, initialGuideVolume]);

  const play = useCallback(() => {
    instrumentalRef.current?.play().catch(() => {});
    vocalsRef.current?.play().catch(() => {});
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    instrumentalRef.current?.pause();
    vocalsRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    instrumentalRef.current?.play().catch(() => {});
    vocalsRef.current?.play().catch(() => {});
    setIsPlaying(true);
  }, []);

  const seek = useCallback((time: number) => {
    if (instrumentalRef.current) {
      instrumentalRef.current.currentTime = time;
    }
    if (vocalsRef.current) {
      vocalsRef.current.currentTime = time;
    }
    currentTimeRef.current = time;
    setIsFinished(false);
  }, []);

  const setGuideVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setGuideVolumeState(clamped);
    if (vocalsRef.current) {
      vocalsRef.current.volume = amplitudeToVolume(clamped);
    }
  }, []);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (instrumentalRef.current) {
      instrumentalRef.current.pause();
      instrumentalRef.current.src = '';
    }
    if (vocalsRef.current) {
      vocalsRef.current.pause();
      vocalsRef.current.src = '';
    }
  }, []);

  return {
    getCurrentTime,
    subscribe,
    duration,
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
  };
}
