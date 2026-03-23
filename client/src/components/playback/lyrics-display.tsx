import type { TimeSubscriber } from '@/hooks/use-audio-player';
import type { Segment } from '@/types/Transcript';
import { useEffect, useRef, useState } from 'react';

const LYRICS_LEAD = 0.15;
const WORD_HIGHLIGHT_LEAD = 0.25;
const COUNTDOWN_DURATION = 3.0;
const COUNTDOWN_GAP_THRESHOLD = 3.5;

const UNSUNG_COLOR = 'rgba(255, 255, 255, 0.5)';
const UNSUNG_ESTIMATED_COLOR = 'rgba(255, 200, 100, 0.4)';
const SUNG_COLOR = 'rgba(255, 255, 255, 1.0)';
const NEXT_LINE_COLOR = 'rgba(255, 255, 255, 0.35)';
const NEXT_LINE_ESTIMATED_COLOR = 'rgba(255, 200, 100, 0.25)';

function parseColor(color: string): [number, number, number] {
  const match = color.match(/[\d.]+/g);
  if (!match) return [255, 255, 255];
  return [parseFloat(match[0]), parseFloat(match[1]), parseFloat(match[2])];
}

const COLOR_CACHE = new Map<string, [number, number, number]>();
function getCachedColor(color: string): [number, number, number] {
  let c = COLOR_CACHE.get(color);
  if (!c) {
    c = parseColor(color);
    COLOR_CACHE.set(color, c);
  }
  return c;
}

function interpolateColor(from: string, to: string, progress: number): string {
  const [fr, fg, fb] = getCachedColor(from);
  const [tr, tg, tb] = getCachedColor(to);
  const p = Math.max(0, Math.min(1, progress));
  const r = fr + (tr - fr) * p;
  const g = fg + (tg - fg) * p;
  const b = fb + (tb - fb) * p;
  const a = 0.5 + 0.5 * p;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function findCurrentSegment(
  segments: Segment[],
  time: number,
  hint: number,
): number {
  const start =
    hint < segments.length && time >= segments[hint].start - LYRICS_LEAD
      ? hint
      : 0;

  for (let i = start; i < segments.length; i++) {
    const seg = segments[i];
    if (time < seg.end + 0.5) {
      if (
        i + 1 < segments.length &&
        time >= segments[i + 1].start - LYRICS_LEAD
      ) {
        return i + 1;
      }
      return i;
    }
  }
  return Math.max(0, segments.length - 1);
}

interface LyricsDisplayProps {
  segments: Segment[];
  subscribe: (fn: TimeSubscriber) => () => void;
  getCurrentTime: () => number;
}

export const LyricsDisplay = ({
  segments,
  subscribe,
  getCurrentTime,
}: LyricsDisplayProps) => {
  const [segIdx, setSegIdx] = useState(() => {
    if (segments.length === 0) return 0;
    return findCurrentSegment(segments, getCurrentTime(), 0);
  });
  const hintRef = useRef(0);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nextContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (segments.length === 0) return;

    return subscribe((time) => {
      const newIdx = findCurrentSegment(segments, time, hintRef.current);
      if (newIdx !== hintRef.current) {
        hintRef.current = newIdx;
        setSegIdx(newIdx);
      }

      const seg = segments[newIdx];
      const active = time >= seg.start - LYRICS_LEAD && time <= seg.end + 0.5;
      const gapBefore =
        newIdx === 0 ? seg.start : seg.start - segments[newIdx - 1].end;
      const timeUntil = seg.start - time;
      const showCountdown =
        gapBefore >= COUNTDOWN_GAP_THRESHOLD &&
        timeUntil > 0 &&
        timeUntil <= COUNTDOWN_DURATION;
      const showCurrent = active || showCountdown;
      const nextExists = newIdx + 1 < segments.length;

      if (containerRef.current) {
        containerRef.current.style.display = showCurrent ? '' : 'none';
      }
      if (nextContainerRef.current) {
        nextContainerRef.current.style.display =
          showCurrent && nextExists ? '' : 'none';
      }

      if (countdownRef.current) {
        if (showCountdown) {
          countdownRef.current.style.display = '';
          countdownRef.current.textContent = String(Math.ceil(timeUntil));
        } else {
          countdownRef.current.style.display = 'none';
        }
      }

      const spans = wordRefs.current;
      for (let wi = 0; wi < seg.words.length; wi++) {
        const span = spans[wi];
        if (!span) continue;
        const word = seg.words[wi];
        const unsungColor = word.estimated
          ? UNSUNG_ESTIMATED_COLOR
          : UNSUNG_COLOR;

        let color = unsungColor;
        if (active) {
          const wStart = word.start - WORD_HIGHLIGHT_LEAD;
          const wEnd = word.end - WORD_HIGHLIGHT_LEAD;
          if (time >= wEnd) {
            color = SUNG_COLOR;
          } else if (time >= wStart) {
            const progress = (time - wStart) / (wEnd - wStart);
            color = interpolateColor(unsungColor, SUNG_COLOR, progress);
          }
        }
        span.style.color = color;
      }
    });
  }, [segments, subscribe, getCurrentTime]);

  if (segments.length === 0) return null;

  const seg = segments[segIdx];
  const nextSeg = segIdx + 1 < segments.length ? segments[segIdx + 1] : null;

  wordRefs.current = [];

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-[60px] z-10 flex flex-col items-center gap-2 px-10"
      style={{ willChange: 'contents' }}
    >
      <div
        ref={containerRef}
        className="relative max-w-full rounded-lg bg-black/40 px-5 py-2.5"
      >
        <span
          ref={countdownRef}
          className="absolute -left-9 -top-9 z-10 flex size-10 items-center justify-center rounded-full bg-white/20 text-[22px] font-bold text-white"
          style={{ display: 'none' }}
        />
        {seg.words.length > 0 && (
          <p className="text-center text-[2.5rem] leading-tight font-bold">
            {seg.words.map((word, wi) => (
              <span
                key={`${segIdx}-${wi}`}
                ref={(el) => {
                  wordRefs.current[wi] = el;
                }}
                style={{ color: UNSUNG_COLOR }}
              >
                {word.word}
                {wi < seg.words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        )}
      </div>

      {nextSeg && (
        <div
          ref={nextContainerRef}
          className="max-w-full rounded-md bg-black/25 px-4 py-1.5"
        >
          <p className="text-center text-[1.5rem] leading-tight">
            {nextSeg.words.map((word, wi) => {
              const color = word.estimated
                ? NEXT_LINE_ESTIMATED_COLOR
                : NEXT_LINE_COLOR;
              return (
                <span key={wi} style={{ color }}>
                  {word.word}
                  {wi < nextSeg.words.length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </p>
        </div>
      )}
    </div>
  );
};

