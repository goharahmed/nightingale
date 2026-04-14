import type { TimeSubscriber } from "@/hooks/use-audio-player";
import { LevelMeter } from "@/components/shared/level-meter";
import { forwardRef, memo, useEffect, useRef } from "react";
import type { VideoFlavor } from "./video-background";
import { isPixabayTheme, themeName } from "./background";
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds) % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatGuideText(volume: number): string {
  const pct = Math.round(volume * 100);
  return pct === 0 ? "Guide: OFF" : `Guide: ${pct}% [G +/-]`;
}

function formatThemeText(themeIndex: number, videoFlavor: VideoFlavor): string {
  return `Theme: ${themeName(themeIndex, videoFlavor)} [T${isPixabayTheme(themeIndex) ? "/F" : ""}]`;
}

// --- Shared sub-components ---

const SkipButton = forwardRef<HTMLButtonElement, { label: string; onClick: () => void }>(
  ({ label, onClick }, ref) => (
    <button
      ref={ref}
      onClick={onClick}
      className="pointer-events-auto flex gap-1 rounded-sm border-2 border-white/70 bg-black/10 px-2.5 py-1 text-sm text-white/90 transition-colors hover:bg-black/20"
      style={{ display: "none" }}
    >
      <span>{label}</span> <span>⏎</span>
    </button>
  ),
);

function HintText({ children, fontSize = "sm" }: { children: React.ReactNode; fontSize?: string }) {
  return <p className={`text-${fontSize} text-white/50`}>{children}</p>;
}

const FOOTER_NOTE_CLASS = `pointer-events-none absolute bottom-2 z-20 text-[0.6rem] text-white/30`;

/** Color palette for multi-mic vocalist slots */
const VOCALIST_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24"] as const;

function Disclaimer({ source }: { source: string }) {
  const text =
    source === "lyrics"
      ? "Timing is AI-generated and may not be perfectly accurate"
      : "Lyrics and timing are AI-generated and may not be perfectly accurate";

  return (
    <p className={`${FOOTER_NOTE_CLASS} left-1/2 -translate-x-1/2 whitespace-nowrap text-center`}>
      {text}
    </p>
  );
}

// --- Main component ---

interface PlaybackHudProps {
  title: string;
  artist: string;
  duration: number;
  guideVolume: number;
  themeIndex: number;
  videoFlavor: VideoFlavor;
  firstSegmentStart: number;
  introSkipLeadSec: number;
  lastSegmentEnd: number;
  onSkipIntro: () => void;
  onSkipOutro: () => void;
  subscribe: (fn: TimeSubscriber) => () => void;
  getCurrentTime: () => number;
  transcriptSource: string;
  pitchScore: number | null;
  micOn: boolean;
  micName: string;
  micMirrorOn: boolean;
  /** Per-slot scores for multi-mic mode. null when not in multi-mic mode. */
  slotScores?: (number | null)[] | null;
  /** How many mic slots are active (1 = legacy single-mic). */
  micSlotCount?: number;
  /** RMS level for single-mic mode (0.0–1.0). */
  micRms?: number;
  /** Per-slot RMS levels for multi-mic mode. */
  slotRms?: number[] | null;
  /** Whether a romanized (or other script variant) transcript is available */
  hasScriptVariants?: boolean;
  /** The currently active script variant (null = original) */
  activeScript?: string | null;
  /** Callback to toggle between original and romanized script */
  onToggleScript?: () => void;
}

function PlaybackHudImpl({
  title,
  artist,
  duration,
  guideVolume,
  themeIndex,
  videoFlavor,
  firstSegmentStart,
  introSkipLeadSec,
  lastSegmentEnd,
  onSkipIntro,
  onSkipOutro,
  subscribe,
  getCurrentTime,
  transcriptSource,
  pitchScore,
  micOn,
  micName,
  micMirrorOn,
  slotScores,
  micSlotCount = 1,
  micRms = 0,
  slotRms,
  hasScriptVariants = false,
  activeScript = null,
  onToggleScript,
}: PlaybackHudProps) {
  const lastSecondRef = useRef(-1);
  const timerRef = useRef<HTMLParagraphElement>(null);
  const skipIntroRef = useRef<HTMLButtonElement>(null);
  const skipOutroRef = useRef<HTMLButtonElement>(null);

  const showPixabayCredit = isPixabayTheme(themeIndex);

  // Updates the timer text and skip-button visibility via direct DOM mutation
  // (rAF subscriber), only triggering a text update when the displayed second changes.
  useEffect(() => {
    if (timerRef.current) {
      timerRef.current.textContent = `${formatTime(getCurrentTime())} / ${formatTime(duration)}`;
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
          time < firstSegmentStart - introSkipLeadSec ? "" : "none";
      }
      if (skipOutroRef.current) {
        skipOutroRef.current.style.display = time > lastSegmentEnd + 1 ? "" : "none";
      }
    });
  }, [subscribe, getCurrentTime, duration, firstSegmentStart, introSkipLeadSec, lastSegmentEnd]);

  return (
    <>
      <div className="pointer-events-auto absolute inset-x-0 top-3 z-20 flex justify-between px-4">
        <div className="max-w-[40%] overflow-hidden">
          <h1 className="truncate text-[1.375rem] text-white">{title}</h1>
          <p className="truncate text-base text-white/70">{artist}</p>
          <p ref={timerRef} className="text-base text-white/70">
            0:00 / {formatTime(duration)}
          </p>
          <div className="mt-2 flex gap-2">
            <SkipButton ref={skipIntroRef} label="Skip Intro" onClick={onSkipIntro} />
            <SkipButton ref={skipOutroRef} label="Skip Outro" onClick={onSkipOutro} />
          </div>
        </div>

        <div className="flex flex-col items-end">
          {micSlotCount > 1 && slotScores ? (
            <div className="flex flex-col items-end gap-0.5">
              {slotScores.slice(0, micSlotCount).map((s, i) => (
                <div
                  key={i}
                  className="text-sm"
                  style={{ color: s != null ? VOCALIST_COLORS[i] : "rgba(255,255,255,0.35)" }}
                >
                  Mic {i + 1}: {s ?? "--"}
                </div>
              ))}
            </div>
          ) : (
            <div className={`text-lg text-white${pitchScore ? "" : "/50"}`}>
              Score: {pitchScore ?? "--"}
            </div>
          )}
          <HintText>{formatGuideText(guideVolume)}</HintText>
          <HintText>Mic: {micOn ? micName : "OFF"} [M/N]</HintText>
          {micOn &&
            (micSlotCount > 1 && slotRms ? (
              <div className="flex flex-col items-end gap-0.5 w-28">
                {slotRms.slice(0, micSlotCount).map((r, i) => (
                  <div key={i} className="flex items-center gap-1 w-full">
                    <span className="text-[0.6rem] text-white/40 w-5">{i + 1}</span>
                    <LevelMeter level={r} height="4px" variant="overlay" />
                  </div>
                ))}
              </div>
            ) : (
              <LevelMeter level={micRms} width="7rem" height="4px" variant="overlay" />
            ))}
          <HintText>Mirror: {micMirrorOn ? "ON" : "OFF"} [R]</HintText>
          <HintText>{formatThemeText(themeIndex, videoFlavor)}</HintText>
          {hasScriptVariants && (
            <button
              onClick={onToggleScript}
              className="pointer-events-auto mt-1 flex items-center gap-1.5 rounded-sm border border-white/30 bg-black/20 px-2 py-0.5 text-xs text-white/70 transition-colors hover:bg-black/30 hover:text-white/90"
            >
              <span className="text-[0.65rem]">文A</span>
              <span>{activeScript ? "Original" : "Romanized"} [L]</span>
            </button>
          )}
          <HintText>[ESC] Back</HintText>
        </div>
      </div>

      {showPixabayCredit && <p className={`${FOOTER_NOTE_CLASS} right-4`}>Videos by Pixabay</p>}

      <Disclaimer source={transcriptSource} />
    </>
  );
}

export const PlaybackHud = memo(PlaybackHudImpl);
