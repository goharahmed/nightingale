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

  return pct === 0 ? 'Guide: OFF' : `Guide: ${pct}% [G +/-]`;
}

function formatThemeText(
  themeIndex: number,
  videoFlavor: VideoFlavor,
): string {
  return `Theme: ${themeName(themeIndex, videoFlavor)} [T / F]`;
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
  transcriptSource: string;
}

function Disclaimer({ source }: { source: string }) {
  const text =
    source === 'lyrics'
      ? 'Timing is AI-generated and may not be perfectly accurate'
      : 'Lyrics and timing are AI-generated and may not be perfectly accurate';
  return (
    <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center whitespace-nowrap pointer-events-none z-20 text-[12px] text-white/30">
      {text}
    </p>
  );
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
  transcriptSource
}: PlaybackHudProps) => {
  const lastSecondRef = useRef(-1);
  const timerRef = useRef<HTMLParagraphElement>(null);
  const skipIntroRef = useRef<HTMLButtonElement>(null);
  const skipOutroRef = useRef<HTMLButtonElement>(null);

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
      <div className="pointer-events-auto absolute inset-x-0 top-3 z-20 flex justify-between px-4">
        <div className="max-w-[40%] overflow-hidden">
          <h1 className="truncate text-[22px] text-white">
            {title}
          </h1>
          <p className="truncate text-[16px] text-white/70">{artist}</p>
          <p ref={timerRef} className="text-[16px] text-white/70">
            0:00 / {formatTime(duration)}
          </p>

          <div className="mt-2 flex gap-2">
            <button
              ref={skipIntroRef}
              onClick={onSkipIntro}
              className="text-[14px] pointer-events-auto rounded-md border-2 border-white/70 bg-black/10 px-3 py-1 text-white/90 transition-colors hover:bg-black/20 flex gap-1"
              style={{ display: 'none' }}
            >
              <span>Skip Intro</span> <span>⏎</span>
            </button>
            <button
              ref={skipOutroRef}
              onClick={onSkipOutro}
              className="text-[14px] pointer-events-auto rounded-md border-2 border-white/70 bg-black/10 px-3 py-1 text-white/90 transition-colors hover:bg-black/20 flex gap-1"
              style={{ display: 'none' }}
            >
              <span>Skip Outro</span><span>⏎</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <p className="text-[14px] text-white/50">
            {formatGuideText(guideVolume)}
          </p>
          <p className="text-[14px] text-white/50">
            {formatThemeText(themeIndex, videoFlavor)}
          </p>
          <p className="text-[14px] text-white/50">[ESC] Back</p>
        </div>
      </div>

      {showPixabayCredit && (
        <p className="pointer-events-none absolute right-4 bottom-2 z-20 text-[12px] text-white/30">
          Videos by Pixabay
        </p>
      )}

      <Disclaimer source={transcriptSource} />
    </>
  );
};
