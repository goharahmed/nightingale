import type { TimeSubscriber } from '@/hooks/use-audio-player';
import {
  fetchPixabayVideos,
  getMediaPort,
  mediaUrl,
} from '@/tauri-bridge/playback';
import { useCallback, useEffect, useRef, useState } from 'react';

export const FLAVORS = [
  'nature',
  'underwater',
  'space',
  'city',
  'countryside',
] as const;

export type VideoFlavor = (typeof FLAVORS)[number];

const VIDEO_CLASS = 'pointer-events-none absolute inset-0 size-full object-cover';

const SOURCE_VIDEO_DRIFT_LARGE = 0.75;
const SOURCE_VIDEO_DRIFT_CORRECT = 0.5;
const SOURCE_VIDEO_SYNC_THROTTLE_MS = 500;

function getNextFlavor(flavor: VideoFlavor): VideoFlavor {
  const idx = FLAVORS.indexOf(flavor);
  return FLAVORS[(idx + 1) % FLAVORS.length];
}

const STALL_TIMEOUT = 4000;

type Trio = [string, string, string];

interface PixabayVideoProps {
  flavor: VideoFlavor;
  isPlaying: boolean;
}

export const PixabayVideo = ({ flavor, isPlaying }: PixabayVideoProps) => {
  const videoRefs = [
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
  ];

  const [activeIdx, setActiveIdx] = useState(0);
  const activeIdxRef = useRef(0);
  const [srcs, setSrcs] = useState<Trio>(['', '', '']);
  const srcsRef = useRef<Trio>(['', '', '']);
  const slotFlavors = useRef<Trio>(['', '', '']);

  const readyUrls = useRef(new Set<string>());
  const urlsPerFlavor = useRef(new Map<string, string[]>());
  const indexPerFlavor = useRef(new Map<string, number>());
  const flavorRef = useRef(flavor);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const generationRef = useRef(0);
  const lastTimeRef = useRef(0);
  const stallTimerRef = useRef(0);
  const portRef = useRef(0);

  const writeSrcs = useCallback((next: Trio) => {
    srcsRef.current = next;
    setSrcs(next);
  }, []);

  const activate = useCallback((idx: number) => {
    activeIdxRef.current = idx;
    setActiveIdx(idx);
    const video = videoRefs[idx].current;
    if (video && isPlayingRef.current) video.play().catch(() => {});
  }, []);

  const pullUrl = useCallback((flav: string): string => {
    const urls = urlsPerFlavor.current.get(flav);
    if (!urls || urls.length === 0) return '';
    const i = indexPerFlavor.current.get(flav) ?? 0;
    const url = urls[i % urls.length];
    indexPerFlavor.current.set(flav, i + 1);
    return url;
  }, []);

  const setSlot = useCallback((slot: number, url: string, flav: string) => {
    const next: Trio = [...srcsRef.current];
    next[slot] = url;
    writeSrcs(next);
    slotFlavors.current[slot] = flav;
    readyUrls.current.delete(url);

    const video = videoRefs[slot].current;
    if (video) {
      video.addEventListener(
        'canplay',
        () => { readyUrls.current.add(url); },
        { once: true },
      );
    }
  }, []);

  const handleEnded = useCallback(() => {
    const cur = activeIdxRef.current;
    const nextSlot = (cur + 1) % 3;
    const nextSrc = srcsRef.current[nextSlot];

    if (nextSrc && readyUrls.current.has(nextSrc)) {
      activate(nextSlot);
      const url = pullUrl(flavorRef.current);
      if (url) setSlot(cur, url, flavorRef.current);
    } else {
      const video = videoRefs[cur].current;
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    generationRef.current++;
    const gen = generationRef.current;
    flavorRef.current = flavor;
    const upcoming = getNextFlavor(flavor);

    const ensureUrls = async (flav: string) => {
      if (urlsPerFlavor.current.has(flav)) return;
      const [paths, port] = await Promise.all([
        fetchPixabayVideos(flav),
        portRef.current ? Promise.resolve(portRef.current) : getMediaPort(),
      ]);
      if (cancelled || gen !== generationRef.current) return;
      if (!portRef.current) portRef.current = port;
      if (paths.length > 0) {
        urlsPerFlavor.current.set(
          flav,
          paths.map((p) => mediaUrl(portRef.current, p)),
        );
        indexPerFlavor.current.set(flav, 0);
      }
    };

    Promise.all([ensureUrls(flavor), ensureUrls(upcoming)]).then(() => {
      if (cancelled || gen !== generationRef.current) return;
      if (!urlsPerFlavor.current.has(flavor)) return;

      const cur = activeIdxRef.current;

      let preloadedSlot = -1;
      for (let i = 0; i < 3; i++) {
        if (
          i !== cur &&
          slotFlavors.current[i] === flavor &&
          srcsRef.current[i] &&
          readyUrls.current.has(srcsRef.current[i])
        ) {
          preloadedSlot = i;
          break;
        }
      }

      if (preloadedSlot >= 0) {
        activate(preloadedSlot);

        const nextVideoSlot = (preloadedSlot + 1) % 3;
        const nextFlavorSlot = (preloadedSlot + 2) % 3;
        const nextUrl = pullUrl(flavor);
        const flavorUrl = pullUrl(upcoming);

        if (nextUrl) setSlot(nextVideoSlot, nextUrl, flavor);
        if (flavorUrl) setSlot(nextFlavorSlot, flavorUrl, upcoming);
      } else {
        const playSlot = (cur + 1) % 3;
        const preSlot = (cur + 2) % 3;

        const playUrl = pullUrl(flavor);
        const nextUrl = pullUrl(flavor);
        const flavorUrl = pullUrl(upcoming);
        if (!playUrl) return;

        setSlot(playSlot, playUrl, flavor);
        if (nextUrl) setSlot(preSlot, nextUrl, flavor);

        const video = videoRefs[playSlot].current;
        if (!video) return;

        const doSwap = () => {
          if (cancelled || gen !== generationRef.current) return;
          activate(playSlot);
          if (flavorUrl) {
            const fSlot = (playSlot + 2) % 3;
            setSlot(fSlot, flavorUrl, upcoming);
          }
        };

        if (video.readyState >= 3) {
          readyUrls.current.add(playUrl);
          doSwap();
        } else {
          video.addEventListener('canplay', () => {
            readyUrls.current.add(playUrl);
            doSwap();
          }, { once: true });
        }
      }
    });

    return () => { cancelled = true; };
  }, [flavor]);

  useEffect(() => {
    const video = videoRefs[activeIdx].current;
    if (!video) return;
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, activeIdx]);

  useEffect(() => {
    const video = videoRefs[activeIdx].current;
    if (!video) return;

    lastTimeRef.current = video.currentTime;
    const onTimeUpdate = () => { lastTimeRef.current = video.currentTime; };
    video.addEventListener('timeupdate', onTimeUpdate);

    stallTimerRef.current = window.setInterval(() => {
      if (!video.paused && video.currentTime === lastTimeRef.current) {
        handleEnded();
      }
    }, STALL_TIMEOUT);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      clearInterval(stallTimerRef.current);
    };
  }, [activeIdx, handleEnded]);

  return (
    <>
      {videoRefs.map((ref, i) => (
        <video
          key={i}
          ref={ref}
          className={VIDEO_CLASS}
          style={{ visibility: i === activeIdx ? 'visible' : 'hidden' }}
          src={srcs[i] || undefined}
          preload="auto"
          muted
          playsInline
          onEnded={i === activeIdx ? handleEnded : undefined}
          onError={i === activeIdx ? handleEnded : undefined}
        />
      ))}
    </>
  );
};

interface SourceVideoProps {
  filePath: string;
  isPlaying: boolean;
  subscribe: (fn: TimeSubscriber) => () => void;
  getCurrentTime: () => number;
}

export const SourceVideo = ({
  filePath,
  isPlaying,
  subscribe,
  getCurrentTime,
}: SourceVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSyncRef = useRef(0);
  const [src, setSrc] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    initializedRef.current = false;
    getMediaPort().then((port) => setSrc(mediaUrl(port, filePath)));
  }, [filePath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    initializedRef.current = false;

    const init = () => {
      const t = getCurrentTime();
      if (t > 0.1) video.currentTime = t;
      initializedRef.current = true;
      if (isPlayingRef.current) video.play().catch(() => {});
    };

    if (video.readyState >= 1) {
      init();
    } else {
      video.addEventListener('loadedmetadata', init, { once: true });
      return () => video.removeEventListener('loadedmetadata', init);
    }
  }, [src, getCurrentTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !initializedRef.current) return;
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    return subscribe((time) => {
      const video = videoRef.current;
      if (!video || !initializedRef.current) return;

      const drift = Math.abs(video.currentTime - time);
      const now = performance.now();

      if (drift > SOURCE_VIDEO_DRIFT_LARGE) {
        video.currentTime = time;
        lastSyncRef.current = now;
      } else if (
        drift > SOURCE_VIDEO_DRIFT_CORRECT &&
        now - lastSyncRef.current > SOURCE_VIDEO_SYNC_THROTTLE_MS
      ) {
        video.currentTime = time;
        lastSyncRef.current = now;
      }
    });
  }, [subscribe, getCurrentTime]);

  if (!src) return null;

  return (
    <video
      ref={videoRef}
      className={VIDEO_CLASS}
      src={src}
      muted
      playsInline
    />
  );
};
