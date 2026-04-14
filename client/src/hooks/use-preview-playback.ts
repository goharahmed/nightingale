import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createElement } from "react";
import { getMediaPort } from "@/tauri-bridge/playback";
import type { Song } from "@/types/Song";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Minimum seek offset from the start of the song (seconds). */
const MIN_SEEK = 5;
/** Duration of the preview snippet (seconds). */
export const PREVIEW_DURATION = 15;
/** Volume fade-in / fade-out duration (seconds). */
const FADE_DURATION = 1.5;
/** Interval for checking playback position (ms). */
const TICK_INTERVAL = 100;
/** Target playback volume (0–1). */
const TARGET_VOLUME = 0.8;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function randomSeekOffset(songDurationSecs: number): number {
  // Pick a random point anywhere in the song, leaving enough room for the
  // full preview snippet plus fades, and skipping the first few seconds.
  const safeEnd = Math.max(MIN_SEEK, songDurationSecs - PREVIEW_DURATION - 2);
  return MIN_SEEK + Math.random() * (safeEnd - MIN_SEEK);
}

/* ------------------------------------------------------------------ */
/*  Context & provider                                                */
/* ------------------------------------------------------------------ */

export interface PreviewState {
  /** file_hash of the song currently being previewed, or null */
  currentHash: string | null;
  /** Is audio actively playing right now? */
  isPlaying: boolean;
  /** Elapsed seconds within the 15-second snippet */
  elapsed: number;
}

export interface PreviewActions {
  /** Start a sneak-peek for the given song. Stops any existing preview first. */
  startPreview: (song: Song) => void;
  /** Stop the current preview. */
  stopPreview: () => void;
}

export type PreviewContextValue = PreviewState & PreviewActions;

const PreviewContext = createContext<PreviewContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider implementation                                           */
/* ------------------------------------------------------------------ */

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PreviewState>({
    currentHash: null,
    isPlaying: false,
    elapsed: 0,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seekStartRef = useRef(0);
  const mediaBaseRef = useRef<string | null>(null);

  // Lazily resolve media server base URL
  const getBaseUrl = useCallback(async () => {
    if (mediaBaseRef.current) return mediaBaseRef.current;
    const port = await getMediaPort();
    mediaBaseRef.current = `http://127.0.0.1:${port}`;
    return mediaBaseRef.current;
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load(); // release resources
    }
    setState({ currentHash: null, isPlaying: false, elapsed: 0 });
  }, []);

  const stopPreview = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const startPreview = useCallback(
    (song: Song) => {
      // Stop any existing preview first
      cleanup();

      const seekOffset = randomSeekOffset(song.duration_secs);
      seekStartRef.current = seekOffset;

      // Create or reuse audio element
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;
      audio.volume = 0; // start silent for fade-in

      setState({ currentHash: song.file_hash, isPlaying: false, elapsed: 0 });

      void (async () => {
        try {
          const base = await getBaseUrl();
          const url = `${base}/${encodeURIComponent(song.path)}`;
          audio.src = url;

          // Wait until the browser has enough metadata to allow seeking,
          // otherwise setting currentTime is silently ignored / reset to 0.
          await new Promise<void>((resolve) => {
            const onReady = () => {
              audio.removeEventListener("loadedmetadata", onReady);
              resolve();
            };
            // If metadata is already loaded (cached), readyState >= 1
            if (audio.readyState >= 1) {
              resolve();
            } else {
              audio.addEventListener("loadedmetadata", onReady);
            }
          });

          audio.currentTime = seekOffset;
          await audio.play();
          setState((s) => ({ ...s, isPlaying: true }));

          // Tick: handle fade-in, elapsed tracking, fade-out, and auto-stop
          timerRef.current = setInterval(() => {
            const elapsed = audio.currentTime - seekStartRef.current;

            // Fade-in
            if (elapsed < FADE_DURATION) {
              audio.volume = Math.min(TARGET_VOLUME, (elapsed / FADE_DURATION) * TARGET_VOLUME);
            }

            // Fade-out (start fading FADE_DURATION before the end)
            const remaining = PREVIEW_DURATION - elapsed;
            if (remaining <= FADE_DURATION && remaining > 0) {
              audio.volume = Math.max(0, (remaining / FADE_DURATION) * TARGET_VOLUME);
            }

            // Auto-stop after PREVIEW_DURATION
            if (elapsed >= PREVIEW_DURATION) {
              cleanup();
              return;
            }

            setState((s) => ({ ...s, elapsed: Math.min(elapsed, PREVIEW_DURATION) }));
          }, TICK_INTERVAL);
        } catch {
          // If playback fails (e.g. unsupported format), silently clean up
          cleanup();
        }
      })();
    },
    [cleanup, getBaseUrl],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const value: PreviewContextValue = {
    ...state,
    startPreview,
    stopPreview,
  };

  return createElement(PreviewContext.Provider, { value }, children);
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function usePreviewPlayback(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (!ctx) {
    throw new Error("usePreviewPlayback must be used within a PreviewProvider");
  }
  return ctx;
}
