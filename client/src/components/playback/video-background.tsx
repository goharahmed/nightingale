import type { TimeSubscriber } from '@/hooks/use-audio-player';
import { fetchPixabayVideos, getMediaPort, mediaUrl } from '@/tauri-bridge/playback';
import { useEffect, useRef, useState } from 'react';

const FLAVORS = ['nature', 'underwater', 'space', 'city', 'countryside'] as const;
export type VideoFlavor = (typeof FLAVORS)[number];

interface PixabayVideoProps {
  flavor: VideoFlavor;
}

export const PixabayVideo = ({ flavor }: PixabayVideoProps) => {
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPixabayVideos(flavor), getMediaPort()])
      .then(([paths, port]) => {
        if (!cancelled && paths.length > 0) {
          setVideoUrls(paths.map((p) => mediaUrl(port, p)));
          setIndex(0);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [flavor]);

  if (videoUrls.length === 0) return null;

  const src = videoUrls[index % videoUrls.length];

  return (
    <video
      key={src}
      className="pointer-events-none absolute inset-0 size-full object-cover"
      src={src}
      autoPlay
      muted
      playsInline
      onEnded={() => setIndex((i) => (i + 1) % videoUrls.length)}
    />
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

  useEffect(() => {
    getMediaPort().then((port) => setSrc(mediaUrl(port, filePath)));
  }, [filePath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    return subscribe((time) => {
      const video = videoRef.current;
      if (!video) return;

      const drift = Math.abs(video.currentTime - time);
      const now = performance.now();
      if (drift > 0.5 && now - lastSyncRef.current > 500) {
        video.currentTime = time;
        lastSyncRef.current = now;
      }
    });
  }, [subscribe, getCurrentTime]);

  if (!src) return null;

  return (
    <video
      ref={videoRef}
      className="pointer-events-none absolute inset-0 size-full object-cover"
      src={src}
      muted
      playsInline
    />
  );
};

export { FLAVORS };
