import type { TimeSubscriber } from "@/hooks/use-audio-player";
import { joinMediaUrl } from "@/adapters/playback";
import {
  fetchPixabayVideos,
  getMediaPort,
  type PixabayVideoDownloaded,
  onPixabayVideoDownloaded,
} from "@/tauri-bridge/playback";
import { useCallback, useEffect, useRef, useState } from "react";

export const FLAVORS = ["nature", "underwater", "space", "city", "countryside"] as const;

export type VideoFlavor = (typeof FLAVORS)[number];

const VIDEO_CLASS = "pointer-events-none absolute inset-0 size-full object-cover";

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

const MIN_QUEUE_BEFORE_REFRESH = 2;
const REFRESH_COOLDOWN_MS = 8000;

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const PixabayVideo = ({ flavor, isPlaying }: PixabayVideoProps) => {
  const videoRefs = [
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
  ];

  const [activeIdx, setActiveIdx] = useState(0);
  const activeIdxRef = useRef(0);
  const [srcs, setSrcs] = useState<Trio>(["", "", ""]);
  const srcsRef = useRef<Trio>(["", "", ""]);
  const slotFlavors = useRef<Trio>(["", "", ""]);

  const readyUrls = useRef(new Set<string>());
  const urlsPerFlavor = useRef(new Map<string, string[]>());
  const queuePerFlavor = useRef(new Map<string, string[]>());
  const fallbackIndexPerFlavor = useRef(new Map<string, number>());
  const flavorRef = useRef(flavor);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const lastTimeRef = useRef(0);
  const stallTimerRef = useRef(0);
  const portRef = useRef(0);
  const inflightFetches = useRef(new Set<string>());
  const lastRefreshAt = useRef(new Map<string, number>());
  const pendingDownloads = useRef<PixabayVideoDownloaded[]>([]);

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

  const toUrl = useCallback((path: string): string => {
    return joinMediaUrl(`http://127.0.0.1:${portRef.current}`, path);
  }, []);

  const queueLength = useCallback((flav: string): number => {
    return queuePerFlavor.current.get(flav)?.length ?? 0;
  }, []);

  const ensurePort = useCallback(async () => {
    if (portRef.current) return portRef.current;
    const port = await getMediaPort();
    portRef.current = port;
    return port;
  }, []);

  const registerUrls = useCallback((flav: string, urls: string[]) => {
    if (urls.length === 0) return;

    const existing = urlsPerFlavor.current.get(flav) ?? [];
    const known = new Set(existing);
    const fresh = urls.filter((url) => !known.has(url));
    if (fresh.length === 0) return;

    const merged = [...existing, ...fresh];
    urlsPerFlavor.current.set(flav, merged);

    const queue = queuePerFlavor.current.get(flav) ?? [];
    queuePerFlavor.current.set(flav, [...queue, ...shuffled(fresh)]);
  }, []);

  const removeUrlFromFlavor = useCallback((flav: string, url: string) => {
    const urls = urlsPerFlavor.current.get(flav) ?? [];
    const nextUrls = urls.filter((u) => u !== url);
    urlsPerFlavor.current.set(flav, nextUrls);

    const queue = queuePerFlavor.current.get(flav) ?? [];
    queuePerFlavor.current.set(
      flav,
      queue.filter((u) => u !== url),
    );
    readyUrls.current.delete(url);
  }, []);

  const pullUrl = useCallback((flav: string, allowFallback: boolean): string => {
    const queue = queuePerFlavor.current.get(flav) ?? [];
    const known = new Set(urlsPerFlavor.current.get(flav) ?? []);
    while (queue.length > 0) {
      const next = queue.shift() ?? "";
      if (next && known.has(next)) {
        queuePerFlavor.current.set(flav, queue);
        return next;
      }
    }
    queuePerFlavor.current.set(flav, queue);

    if (!allowFallback) return "";
    const urls = urlsPerFlavor.current.get(flav) ?? [];
    if (urls.length === 0) return "";
    const idx = fallbackIndexPerFlavor.current.get(flav) ?? 0;
    fallbackIndexPerFlavor.current.set(flav, idx + 1);
    return urls[idx % urls.length];
  }, []);

  const setSlot = useCallback(
    (slot: number, url: string, flav: string) => {
      const next: Trio = [...srcsRef.current];
      next[slot] = url;
      writeSrcs(next);
      slotFlavors.current[slot] = flav;
      readyUrls.current.delete(url);

      const video = videoRefs[slot].current;
      if (video) {
        video.addEventListener(
          "canplay",
          () => {
            readyUrls.current.add(url);
          },
          { once: true },
        );
      }
    },
    [writeSrcs],
  );

  const activateWhenReady = useCallback(
    (slot: number, url: string, flav: string) => {
      const tryActivate = () => {
        if (
          srcsRef.current[slot] === url &&
          slotFlavors.current[slot] === flav &&
          flavorRef.current === flav
        ) {
          activate(slot);
        }
      };

      if (readyUrls.current.has(url)) {
        tryActivate();
        return;
      }

      const video = videoRefs[slot].current;
      if (!video) return;

      video.addEventListener(
        "canplay",
        () => {
          tryActivate();
        },
        { once: true },
      );
    },
    [activate],
  );

  const keepCurrentAlive = useCallback((slot: number) => {
    const video = videoRefs[slot].current;
    if (!video) return;

    const isAtEnd =
      Number.isFinite(video.duration) &&
      video.duration > 0 &&
      video.currentTime >= video.duration - 0.05;

    if (video.ended || isAtEnd) {
      video.currentTime = 0;
    }

    if (isPlayingRef.current) {
      video.play().catch(() => {});
    }
  }, []);

  const refillSlots = useCallback(
    (flav: string) => {
      const cur = activeIdxRef.current;
      for (let i = 0; i < 3; i++) {
        if (i === cur) continue;
        if (slotFlavors.current[i] !== flav || !srcsRef.current[i]) {
          const url = pullUrl(flav, false) || pullUrl(flav, true);
          if (url) setSlot(i, url, flav);
        }
      }
    },
    [pullUrl, setSlot],
  );

  const ensureFlavorPlayback = useCallback(
    (flav: string) => {
      const cur = activeIdxRef.current;

      const activeSrc = srcsRef.current[cur];
      if (activeSrc && slotFlavors.current[cur] === flav) {
        refillSlots(flav);
        return;
      }

      for (let i = 0; i < 3; i++) {
        if (
          i !== cur &&
          slotFlavors.current[i] === flav &&
          srcsRef.current[i] &&
          readyUrls.current.has(srcsRef.current[i])
        ) {
          activate(i);
          refillSlots(flav);
          return;
        }
      }

      for (let i = 0; i < 3; i++) {
        const candidate = srcsRef.current[i];
        if (i !== cur && slotFlavors.current[i] === flav && candidate) {
          activateWhenReady(i, candidate, flav);
          refillSlots(flav);
          return;
        }
      }

      const playSlot = (cur + 1) % 3;
      const preSlot = (cur + 2) % 3;
      const playUrl = pullUrl(flav, true);
      if (!playUrl) return;
      setSlot(playSlot, playUrl, flav);
      activateWhenReady(playSlot, playUrl, flav);

      const nextUrl = pullUrl(flav, false) || pullUrl(flav, true);
      if (nextUrl) setSlot(preSlot, nextUrl, flav);
    },
    [activateWhenReady, pullUrl, refillSlots, setSlot],
  );

  const refreshFlavor = useCallback(
    async (flav: string) => {
      const now = Date.now();
      const last = lastRefreshAt.current.get(flav) ?? 0;
      if (now - last < REFRESH_COOLDOWN_MS) return;
      if (inflightFetches.current.has(flav)) return;
      lastRefreshAt.current.set(flav, now);
      inflightFetches.current.add(flav);
      try {
        await ensurePort();
        const paths = await fetchPixabayVideos(flav);
        const urls = paths.map((path) => toUrl(path));
        registerUrls(flav, urls);
        if (flavorRef.current === flav) ensureFlavorPlayback(flav);
      } finally {
        inflightFetches.current.delete(flav);
      }
    },
    [ensureFlavorPlayback, ensurePort, registerUrls, toUrl],
  );

  const ingestDownloaded = useCallback(
    (event: PixabayVideoDownloaded) => {
      if (!portRef.current) {
        pendingDownloads.current.push(event);
        return;
      }
      const newUrl = toUrl(event.path);
      registerUrls(event.flavor, [newUrl]);

      const evictedPath =
        (event as { evictedPath?: string; evicted_path?: string }).evictedPath ??
        (event as { evictedPath?: string; evicted_path?: string }).evicted_path;
      if (evictedPath) {
        removeUrlFromFlavor(event.flavor, toUrl(evictedPath));
      }

      if (event.flavor === flavorRef.current) {
        ensureFlavorPlayback(event.flavor);
      }
    },
    [ensureFlavorPlayback, registerUrls, removeUrlFromFlavor, toUrl],
  );

  const flushPendingDownloads = useCallback(() => {
    if (!portRef.current || pendingDownloads.current.length === 0) return;
    const queued = [...pendingDownloads.current];
    pendingDownloads.current = [];
    queued.forEach((event) => ingestDownloaded(event));
  }, [ingestDownloaded]);

  const handleEnded = useCallback(() => {
    const fl = flavorRef.current;
    const cur = activeIdxRef.current;
    const nextSlot = (cur + 1) % 3;
    const nextSrc = srcsRef.current[nextSlot];

    if (nextSrc && slotFlavors.current[nextSlot] === fl && readyUrls.current.has(nextSrc)) {
      activate(nextSlot);
      const refill = pullUrl(fl, false) || pullUrl(fl, true);
      if (refill) setSlot(cur, refill, fl);
    } else {
      let switched = false;
      for (let i = 0; i < 3; i++) {
        if (
          i !== cur &&
          slotFlavors.current[i] === fl &&
          srcsRef.current[i] &&
          readyUrls.current.has(srcsRef.current[i])
        ) {
          activate(i);
          const refill = pullUrl(fl, false) || pullUrl(fl, true);
          if (refill) setSlot(cur, refill, fl);
          switched = true;
          break;
        }
      }

      if (!switched) {
        const fallback = pullUrl(fl, true);
        if (fallback) {
          setSlot(nextSlot, fallback, fl);
          activateWhenReady(nextSlot, fallback, fl);
        }
        keepCurrentAlive(cur);
      }
    }

    if (queueLength(fl) < MIN_QUEUE_BEFORE_REFRESH) {
      void refreshFlavor(fl);
    }
  }, [activate, activateWhenReady, keepCurrentAlive, pullUrl, queueLength, refreshFlavor, setSlot]);

  useEffect(() => {
    flavorRef.current = flavor;
    ensureFlavorPlayback(flavor);
    void refreshFlavor(flavor);
    // Also keep the likely next flavor warm.
    void refreshFlavor(getNextFlavor(flavor));
  }, [ensureFlavorPlayback, flavor, refreshFlavor]);

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
    const onTimeUpdate = () => {
      lastTimeRef.current = video.currentTime;
    };
    video.addEventListener("timeupdate", onTimeUpdate);

    stallTimerRef.current = window.setInterval(() => {
      if (!video.paused && video.currentTime === lastTimeRef.current) {
        handleEnded();
      }
    }, STALL_TIMEOUT);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      clearInterval(stallTimerRef.current);
    };
  }, [activeIdx, handleEnded]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void ensurePort().then(() => {
      flushPendingDownloads();
      ensureFlavorPlayback(flavorRef.current);
    });

    void onPixabayVideoDownloaded((event) => {
      ingestDownloaded(event);
    }).then((fn) => {
      if (disposed) {
        void Promise.resolve(fn()).catch(() => {
          // Listener may already be gone during rapid remounts.
        });
        return;
      }
      unlisten = fn;
    });

    return () => {
      disposed = true;
      if (!unlisten) return;
      void Promise.resolve(unlisten()).catch(() => {
        // Listener may already be gone during hot reload / strict remount.
      });
    };
  }, [ensureFlavorPlayback, ensurePort, flushPendingDownloads, ingestDownloaded]);

  return (
    <>
      {videoRefs.map((ref, i) => (
        <video
          key={i}
          ref={ref}
          className={VIDEO_CLASS}
          style={{ visibility: i === activeIdx ? "visible" : "hidden" }}
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
  tempoRatio: number;
  isPlaying: boolean;
  isActive: boolean;
  subscribe: (fn: TimeSubscriber) => () => void;
  getCurrentTime: () => number;
}

export const SourceVideo = ({
  filePath,
  tempoRatio,
  isPlaying,
  isActive,
  subscribe,
  getCurrentTime,
}: SourceVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSyncRef = useRef(0);
  const [src, setSrc] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const tempoRatioRef = useRef(tempoRatio);
  tempoRatioRef.current = tempoRatio;

  const normalizedTempoRatio = useCallback(() => {
    const ratio = tempoRatioRef.current;
    if (!Number.isFinite(ratio) || ratio <= 0) return 1;
    return ratio;
  }, []);

  const toSourceTime = useCallback(
    (audioTime: number) => Math.max(0, audioTime * normalizedTempoRatio()),
    [normalizedTempoRatio],
  );

  const applyPlaybackRate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const ratio = normalizedTempoRatio();
    video.playbackRate = Math.min(4, Math.max(0.25, ratio));
  }, [normalizedTempoRatio]);

  const enforceSilentVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultMuted = true;
    video.muted = true;
    video.volume = 0;
  }, []);

  useEffect(() => {
    let cancelled = false;
    initializedRef.current = false;
    setVisible(false);
    getMediaPort().then((port) => {
      if (cancelled) return;
      setSrc(joinMediaUrl(`http://127.0.0.1:${port}`, filePath));
    });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    initializedRef.current = false;
    setVisible(false);
    enforceSilentVideo();
    applyPlaybackRate();

    const finalize = () => {
      if (initializedRef.current) return;
      initializedRef.current = true;
      setVisible(true);
      applyPlaybackRate();
      if (isPlayingRef.current) video.play().catch(() => {});
    };

    const init = () => {
      const t = toSourceTime(getCurrentTime());
      if (t > 0.1) {
        const canSeekTo =
          Number.isFinite(video.duration) && video.duration > 0
            ? Math.min(t, Math.max(0, video.duration - 0.05))
            : t;
        const SEEK_TOLERANCE_SEC = 0.12;
        const isAligned = () => Math.abs(video.currentTime - canSeekTo) <= SEEK_TOLERANCE_SEC;
        const tryFinalize = () => {
          if (isAligned()) finalize();
        };
        const onSeeked = () => {
          tryFinalize();
        };
        const onCanPlay = () => {
          tryFinalize();
        };

        // Some WebKit builds can miss `seeked` when rapidly remounting or swapping sources.
        // Poll alignment and nudge the seek target until the frame position is correct.
        const watchdog = window.setInterval(() => {
          if (initializedRef.current) return;
          if (isAligned()) {
            finalize();
            return;
          }
          if (!video.seeking && video.readyState >= 1) {
            video.currentTime = canSeekTo;
          }
        }, 120);

        video.addEventListener("seeked", onSeeked);
        video.addEventListener("canplay", onCanPlay);
        video.currentTime = canSeekTo;
        return () => {
          window.clearInterval(watchdog);
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("canplay", onCanPlay);
        };
      } else {
        finalize();
        return undefined;
      }
    };

    if (video.readyState >= 1) {
      return init();
    } else {
      video.addEventListener("loadedmetadata", init, { once: true });
      return () => video.removeEventListener("loadedmetadata", init);
    }
  }, [applyPlaybackRate, enforceSilentVideo, getCurrentTime, src, toSourceTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !initializedRef.current) return;
    enforceSilentVideo();
    applyPlaybackRate();
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [applyPlaybackRate, enforceSilentVideo, isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    applyPlaybackRate();
    if (!initializedRef.current) return;

    const target = toSourceTime(getCurrentTime());
    const drift = Math.abs(video.currentTime - target);
    if (drift > SOURCE_VIDEO_DRIFT_CORRECT) {
      video.currentTime = target;
      lastSyncRef.current = performance.now();
    }
  }, [applyPlaybackRate, getCurrentTime, tempoRatio, toSourceTime]);

  useEffect(() => {
    return subscribe((time) => {
      const video = videoRef.current;
      if (!video || !initializedRef.current) return;

      const target = toSourceTime(time);
      const drift = Math.abs(video.currentTime - target);
      const now = performance.now();

      if (drift > SOURCE_VIDEO_DRIFT_LARGE) {
        video.currentTime = target;
        lastSyncRef.current = now;
      } else if (
        drift > SOURCE_VIDEO_DRIFT_CORRECT &&
        now - lastSyncRef.current > SOURCE_VIDEO_SYNC_THROTTLE_MS
      ) {
        video.currentTime = target;
        lastSyncRef.current = now;
      }
    });
  }, [subscribe, toSourceTime]);

  if (!src) return null;

  return (
    <video
      ref={videoRef}
      className={VIDEO_CLASS}
      style={{ visibility: visible && isActive ? "visible" : "hidden" }}
      src={src}
      muted
      playsInline
    />
  );
};
