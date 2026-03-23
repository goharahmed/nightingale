import type { TimeSubscriber } from '@/hooks/use-audio-player';
import {
  fetchPixabayVideos,
  getMediaPort,
  mediaUrl,
} from '@/tauri-bridge/playback';
import { useEffect, useRef, useState } from 'react';

export const FLAVORS = [
  'nature',
  'underwater',
  'space',
  'city',
  'countryside',
] as const;

export type VideoFlavor = (typeof FLAVORS)[number];

const VIDEO_CLASS = 'pointer-events-none absolute inset-0 size-full object-cover';

// Syncs a <video> element's play/pause state with the audio player
function usePlayPause(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  isPlaying: boolean,
) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    };

    if (isPlaying) {
      video.play();
    } else {
      video.pause();
    }
  }, [isPlaying]);
}

interface PixabayVideoProps {
  flavor: VideoFlavor;
  isPlaying: boolean;
}

export const PixabayVideo = ({ flavor, isPlaying }: PixabayVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPixabayVideos(flavor), getMediaPort()])
      .then(([paths, port]) => {
        if (!cancelled && paths.length > 0) {
          setVideoUrls(paths.map((p) => mediaUrl(port, p)));
          setIndex(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [flavor]);

  usePlayPause(videoRef, isPlaying);

  if (videoUrls.length === 0) return null;

  const src = videoUrls[index % videoUrls.length];

  return (
    <video
      ref={videoRef}
      key={src}
      className={VIDEO_CLASS}
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

  usePlayPause(videoRef, isPlaying);

  // Corrects drift between the video and audio clocks.
  // Throttled to avoid excessive seeks (at most once per 500ms).
  useEffect(() => {
    return subscribe((time) => {
      const video = videoRef.current;
      if (!video) {
        return;
      };

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
      className={VIDEO_CLASS}
      src={src}
      muted
      playsInline
    />
  );
};
