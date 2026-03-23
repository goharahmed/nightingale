import type { TimeSubscriber } from '@/hooks/use-audio-player';
import { useEffect, useRef } from 'react';
import type { VideoFlavor } from './video-background';
import { isPixabayTheme, themeName } from './background';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds) % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatGuideText(volume: number): string {
  const pct = Math.round(volume * 100);
  return pct === 0 ? 'Guide: OFF [G +/-]' : `Guide: ${pct}% [G +/-]`;
}

function formatThemeText(
  themeIndex: number,
  videoFlavor: VideoFlavor,
): string {
  return `Theme: ${themeName(themeIndex, videoFlavor)} [T]`;
}

interface PlaybackHudProps {
  title: string;
  artist: string;
  duration: number;
  guideVolume: number;
  themeIndex: number;
  videoFlavor: VideoFlavor;
  firstSegmentStart: number;
  lastSegmentEnd: number;
  onSkipIntro: () => void;
  onSkipOutro: () => void;
  subscribe: (fn: TimeSubscriber) => () => void;
  getCurrentTime: () => number;
}

export const PlaybackHud = ({
  title,
  artist,
  duration,
  guideVolume,
  themeIndex,
  videoFlavor,
  firstSegmentStart,
  lastSegmentEnd,
  onSkipIntro,
  onSkipOutro,
  subscribe,
  getCurrentTime,
}: PlaybackHudProps) => {
  const timerRef = useRef<HTMLParagraphElement>(null);
  const skipIntroRef = useRef<HTMLButtonElement>(null);
  const skipOutroRef = useRef<HTMLButtonElement>(null);
  const lastSecondRef = useRef(-1);
  const showPixabayCredit = isPixabayTheme(themeIndex);

  useEffect(() => {
    const t = getCurrentTime();
    if (timerRef.current) {
      timerRef.current.textContent = `${formatTime(t)} / ${formatTime(duration)}`;
    }

    return subscribe((time) => {
      const sec = Math.floor(time);
      if (sec !== lastSecondRef.current) {
        lastSecondRef.current = sec;
        if (timerRef.current) {
          timerRef.current.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
        }
      }

      if (skipIntroRef.current) {
        skipIntroRef.current.style.display =
          time < firstSegmentStart - 3 ? '' : 'none';
      }
      if (skipOutroRef.current) {
        skipOutroRef.current.style.display =
          time > lastSegmentEnd + 1 ? '' : 'none';
      }
    });
  }, [subscribe, getCurrentTime, duration, firstSegmentStart, lastSegmentEnd]);

  return (
    <>
      <div className="pointer-events-auto absolute inset-x-0 top-4 z-20 flex justify-between px-6">
        <div className="flex max-w-[40%] flex-col gap-0.5 overflow-hidden">
          <h1 className="truncate text-[22px] font-semibold text-white">
            {title}
          </h1>
          <p className="truncate text-base text-white/70">{artist}</p>
          <p ref={timerRef} className="text-sm text-white/70">
            0:00 / {formatTime(duration)}
          </p>

          <div className="mt-2 flex gap-2">
            <button
              ref={skipIntroRef}
              onClick={onSkipIntro}
              className="pointer-events-auto rounded-lg border-2 border-white/30 bg-white/10 px-3.5 py-1.5 text-[13px] text-white/80 transition-colors hover:bg-white/20"
              style={{ display: 'none' }}
            >
              Skip Intro ⏎
            </button>
            <button
              ref={skipOutroRef}
              onClick={onSkipOutro}
              className="pointer-events-auto rounded-lg border-2 border-white/30 bg-white/10 px-3.5 py-1.5 text-[13px] text-white/80 transition-colors hover:bg-white/20"
              style={{ display: 'none' }}
            >
              Skip Outro ⏎
            </button>
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <p className="text-sm text-white/50">
            {formatGuideText(guideVolume)}
          </p>
          <p className="text-sm text-white/50">
            {formatThemeText(themeIndex, videoFlavor)}
          </p>
          <p className="text-sm text-white/50">[ESC] Back</p>
        </div>
      </div>

      {showPixabayCredit && (
        <p className="pointer-events-none absolute right-4 bottom-2 z-20 text-[10px] text-white/30">
          Videos by Pixabay
        </p>
      )}
    </>
  );
};
