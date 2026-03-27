import {
  SOURCE_VIDEO_INDEX,
  nextFlavorIndex,
  nextThemeIndex,
} from "@/components/playback/background";
import { useNavInput } from "@/hooks/navigation/use-nav-input";
import type { AppConfig } from "@/types/AppConfig";
import type { Song } from "@/types/Song";
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

export interface UsePlaybackInputParams {
  paused: boolean;
  song: Song;
  firstSegmentStart: number;
  lastSegmentEnd: number;
  introSkipLeadSec: number;
  guideVolume: number;
  isReady: boolean;
  getCurrentTime: () => number;
  setGuideVolume: (v: number) => void;
  setThemeIndex: Dispatch<SetStateAction<number>>;
  setFlavorIndex: Dispatch<SetStateAction<number>>;
  persistConfig: (patch: Partial<AppConfig>) => void;
  onSkipIntro: () => void;
  onSkipOutro: () => void;
  handlePause: () => void;
  handleContinue: () => void;
  onToggleMic: () => void;
  onCycleMic: () => void;
}

export function usePlaybackInput({
  paused,
  song,
  firstSegmentStart,
  lastSegmentEnd,
  introSkipLeadSec,
  guideVolume,
  isReady,
  getCurrentTime,
  setGuideVolume,
  setThemeIndex,
  setFlavorIndex,
  persistConfig,
  onSkipIntro,
  onSkipOutro,
  handlePause,
  handleContinue,
  onToggleMic,
  onCycleMic,
}: UsePlaybackInputParams) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Gamepad: nav.back = pause/resume, nav.confirm = skip intro/outro
  useNavInput(
    useCallback(
      (action) => {
        if (action.back) {
          if (pausedRef.current) {
            handleContinue();
          } else {
            handlePause();
          }
          return;
        }

        if (pausedRef.current) return;

        if (action.confirm) {
          if (!isReady) return;
          const t = getCurrentTime();
          if (t < firstSegmentStart - introSkipLeadSec) {
            onSkipIntro();
          } else if (t > lastSegmentEnd + 1) {
            onSkipOutro();
          }
        }
      },
      [
        handlePause,
        handleContinue,
        isReady,
        getCurrentTime,
        firstSegmentStart,
        lastSegmentEnd,
        introSkipLeadSec,
        onSkipIntro,
        onSkipOutro,
      ],
    ),
  );

  // Keyboard-only shortcuts (G, T, F, M, N, +/-, Space)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        if (paused) {
          handleContinue();
        } else {
          handlePause();
        }
        return;
      }

      if (paused) return;

      switch (e.key) {
        case "t":
        case "T":
          setThemeIndex((prev) => {
            const next = nextThemeIndex(prev, song.is_video);
            if (next !== SOURCE_VIDEO_INDEX) {
              persistConfig({ last_theme: next });
            }
            return next;
          });
          break;

        case "f":
        case "F":
          setFlavorIndex((prev) => {
            const next = nextFlavorIndex(prev);
            persistConfig({ last_video_flavor: next });
            return next;
          });
          break;

        case "g":
        case "G": {
          const nextVol = guideVolume > 0 ? 0 : 0.3;
          setGuideVolume(nextVol);
          persistConfig({ guide_volume: nextVol });
          break;
        }

        case "=":
        case "+": {
          const next = Math.min(1, guideVolume + 0.1);
          setGuideVolume(next);
          persistConfig({ guide_volume: next });
          break;
        }

        case "-": {
          const next = Math.max(0, guideVolume - 0.1);
          setGuideVolume(next);
          persistConfig({ guide_volume: next });
          break;
        }

        case "m":
        case "M":
          onToggleMic();
          break;

        case "n":
        case "N":
          onCycleMic();
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    paused,
    song.is_video,
    guideVolume,
    setGuideVolume,
    setThemeIndex,
    setFlavorIndex,
    persistConfig,
    handlePause,
    handleContinue,
    onToggleMic,
    onCycleMic,
  ]);
}
