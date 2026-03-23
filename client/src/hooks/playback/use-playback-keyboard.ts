/**
 * Global keyboard shortcuts during playback (themes, guide volume, skip, pause).
 * Registers `window` listeners; cleans up on unmount or when dependencies change.
 */

import { SOURCE_VIDEO_INDEX, nextFlavorIndex, nextThemeIndex } from '@/components/playback/background';
import type { AppConfig } from '@/types/AppConfig';
import type { Song } from '@/types/Song';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect } from 'react';

export interface UsePlaybackKeyboardParams {
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
}

export function usePlaybackKeyboard({
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
}: UsePlaybackKeyboardParams) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
        case 't':
        case 'T':
          setThemeIndex((prev) => {
            const next = nextThemeIndex(prev, song.is_video);
            if (next !== SOURCE_VIDEO_INDEX) {
              persistConfig({ last_theme: next });
            }
            return next;
          });
          break;

        case 'f':
        case 'F':
          setFlavorIndex((prev) => {
            const next = nextFlavorIndex(prev);
            persistConfig({ last_video_flavor: next });
            return next;
          });
          break;

        case 'g':
        case 'G': {
          const nextVol = guideVolume > 0 ? 0 : 0.3;
          setGuideVolume(nextVol);
          persistConfig({ guide_volume: nextVol });
          break;
        }

        case '=':
        case '+': {
          const next = Math.min(1, guideVolume + 0.1);
          setGuideVolume(next);
          persistConfig({ guide_volume: next });
          break;
        }

        case '-': {
          const next = Math.max(0, guideVolume - 0.1);
          setGuideVolume(next);
          persistConfig({ guide_volume: next });
          break;
        }

        case 'Enter': {
          if (!isReady) break;
          const t = getCurrentTime();
          if (t < firstSegmentStart - introSkipLeadSec) {
            onSkipIntro();
          } else if (t > lastSegmentEnd + 1) {
            onSkipOutro();
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    paused,
    song.is_video,
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
  ]);
}
