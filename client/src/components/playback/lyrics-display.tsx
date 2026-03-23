import type { TimeSubscriber } from '@/hooks/use-audio-player';
import type { Segment, Word } from '@/types/Transcript';
import { useEffect, useRef, useState } from 'react';

// Timing offsets: lyrics/words appear slightly before their actual start
// so the visual transition feels in sync with the audio.
const LYRICS_LEAD = 0.15;
const WORD_HIGHLIGHT_LEAD = 0.25;

const COUNTDOWN_DURATION = 3.0;
const COUNTDOWN_GAP_THRESHOLD = 3.5;

// Grace period after a segment ends before it disappears
const SEGMENT_LINGER = 0.5;

type RGB = [number, number, number];

// Color palette grouped by role.
// "estimated" variants are used for words whose timing was inferred, not exact.
const COLORS = {
  unsung: 'rgba(255, 255, 255, 0.5)',
  unsungEstimated: 'rgba(255, 200, 100, 0.4)',
  sung: 'rgba(255, 255, 255, 1.0)',
  nextLine: 'rgba(255, 255, 255, 0.35)',
  nextLineEstimated: 'rgba(255, 200, 100, 0.25)',
} as const;

const unsungColor = (word: Word) =>
  word.estimated ? COLORS.unsungEstimated : COLORS.unsung;

const nextLineColor = (word: Word) =>
  word.estimated ? COLORS.nextLineEstimated : COLORS.nextLine;

// --- Color interpolation utilities ---

const rgbCache = new Map<string, RGB>();

function parseRGB(color: string): RGB {
  let cached = rgbCache.get(color);
  if (cached) {
    return cached;
  };

  const match = color.match(/[\d.]+/g);
  cached = match
    ? [parseFloat(match[0]), parseFloat(match[1]), parseFloat(match[2])]
    : [255, 255, 255];
  rgbCache.set(color, cached);

  return cached;
}

// Linearly blends two rgba colors. Alpha fades from 0.5 → 1.0 as t goes 0 → 1.
function interpolateColor(from: string, to: string, t: number): string {
  const [fr, fg, fb] = parseRGB(from);
  const [tr, tg, tb] = parseRGB(to);

  const p = Math.max(0, Math.min(1, t));

  const r = fr + (tr - fr) * p;
  const g = fg + (tg - fg) * p;
  const b = fb + (tb - fb) * p;
  const a = 0.5 + 0.5 * p;

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// --- Segment search ---

/**
 * Finds the segment index that should be displayed at a given `time`.
 * Uses `hint` (the last known index) to skip already-passed segments.
 * Prefers the *next* segment when the current time falls in the lead-in window.
 */
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
    if (time >= segments[i].end + SEGMENT_LINGER) {
      continue;
    };

    // If we're already in the lead-in of the next segment, jump ahead
    const next = i + 1;
    if (next < segments.length && time >= segments[next].start - LYRICS_LEAD) {
      return next;
    }

    return i;
  }

  return Math.max(0, segments.length - 1);
}

// --- Per-frame DOM updates (called via rAF subscriber, no React re-renders) ---

function computeWordColor(word: Word, time: number, isActive: boolean): string {
  const base = unsungColor(word);
  if (!isActive) {
    return base;
  }

  const wStart = word.start - WORD_HIGHLIGHT_LEAD;
  const wEnd = word.end - WORD_HIGHLIGHT_LEAD;

  if (time >= wEnd) {
    return COLORS.sung;
  }

  if (time >= wStart) {
    return interpolateColor(base, COLORS.sung, (time - wStart) / (wEnd - wStart));
  }

  return base;
}

function updateWordSpans(
  spans: (HTMLSpanElement | null)[],
  words: Word[],
  time: number,
  isActive: boolean,
) {
  for (let i = 0; i < words.length; i++) {
    const span = spans[i];

    if (span) span.style.color = computeWordColor(words[i], time, isActive);
  }
}

function updateCountdown(
  el: HTMLSpanElement | null,
  showCountdown: boolean,
  timeUntil: number,
) {
  if (!el) {
    return;
  }

  if (showCountdown) {
    el.style.display = '';
    el.textContent = String(Math.ceil(timeUntil));
  } else {
    el.style.display = 'none';
  }
}

// --- Component ---

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
  const [segIdx, setSegIdx] = useState(() =>
    segments.length === 0
      ? 0
      : findCurrentSegment(segments, getCurrentTime(), 0),
  );

  const hintRef = useRef(0);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nextContainerRef = useRef<HTMLDivElement>(null);

  // Subscribes to the audio player's rAF time updates.
  // All DOM mutations happen here directly via refs to avoid per-frame re-renders.
  // The only React state update is setSegIdx when the active segment changes.
  useEffect(() => {
    if (segments.length === 0) return;

    return subscribe((time) => {
      // Track which segment we're on; only trigger a React re-render when it changes
      const idx = findCurrentSegment(segments, time, hintRef.current);
      if (idx !== hintRef.current) {
        hintRef.current = idx;
        setSegIdx(idx);
      }

      const seg = segments[idx];
      const isActive =
        time >= seg.start - LYRICS_LEAD && time <= seg.end + SEGMENT_LINGER;

      // Show a countdown badge when there's a long instrumental gap before this segment
      const gapBefore =
        idx === 0 ? seg.start : seg.start - segments[idx - 1].end;
      const timeUntil = seg.start - time;
      const showCountdown =
        gapBefore >= COUNTDOWN_GAP_THRESHOLD &&
        timeUntil > 0 &&
        timeUntil <= COUNTDOWN_DURATION;

      // Current line is visible when actively singing or counting down to it
      const showCurrent = isActive || showCountdown;
      const hasNext = idx + 1 < segments.length;

      // Toggle container visibility directly on DOM nodes
      if (containerRef.current)
        containerRef.current.style.display = showCurrent ? '' : 'none';
      if (nextContainerRef.current)
        nextContainerRef.current.style.display =
          showCurrent && hasNext ? '' : 'none';

      updateCountdown(countdownRef.current, showCountdown, timeUntil);
      updateWordSpans(wordRefs.current, seg.words, time, isActive);
    });
  }, [segments, subscribe, getCurrentTime]);

  if (segments.length === 0) {
    return null;
  };

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
          className="absolute -left-9 -top-9 z-10 flex size-10 items-center justify-center rounded-full bg-black/40 text-[22px] font-bold text-white"
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
                style={{ color: COLORS.unsung }}
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
            {nextSeg.words.map((word, wi) => (
              <span key={wi} style={{ color: nextLineColor(word) }}>
                {word.word}
                {wi < nextSeg.words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
};
