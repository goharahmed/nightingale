import { memo } from "react";

/**
 * Compact horizontal input-level meter.
 *
 * `level` is linear RMS (0.0 – ~1.0, post-gain from Rust).  The bar maps
 * through a dB curve over a -60 … 0 dB range.  Color ramps green → yellow
 * → amber → red like a mixer channel strip.
 *
 * Theme-aware via `variant` prop: "themed" (default) adapts to light/dark,
 * "overlay" uses hard-coded light-on-dark for playback HUD.
 *
 * No CSS transition on width — the bar tracks the actual level in real-time
 * without lag.  Wrapped in `memo` so it only re-renders when props change.
 */

interface LevelMeterProps {
  /** Linear RMS level, 0.0 – 1.0+ */
  level: number;
  /** CSS width of the entire meter. Default "100%" */
  width?: string;
  /** CSS height. Default "6px" */
  height?: string;
  /** Extra className on the outer container */
  className?: string;
  /** If true, shows a numeric dB readout to the right */
  showDb?: boolean;
  /**
   * Visual variant.
   * - `"themed"` (default): uses theme tokens (`bg-muted`, `border-border`)
   *    so it works on both light and dark app backgrounds.
   * - `"overlay"`: hard-coded light-on-dark for use over video / dark overlays
   *    (e.g. the playback HUD).
   */
  variant?: "themed" | "overlay";
}

/**
 * Meter dB range.  -60 → 0 dB is the standard range for a VU-style meter.
 * Anything below -60 dB reads as silence (0%).  This keeps the visual range
 * focused on the signal levels that actually matter.
 */
const DB_FLOOR = -60;
const DB_CEIL = 0;
const DB_RANGE = DB_CEIL - DB_FLOOR; // 60

/** Convert linear RMS to a 0–1 visual ratio with a dB-log curve. */
function linearToMeter(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  if (db <= DB_FLOOR) return 0;
  if (db >= DB_CEIL) return 1;
  return (db - DB_FLOOR) / DB_RANGE;
}

/**
 * Pick a color based on the 0-1 meter ratio.
 * Thresholds correspond to standard metering practice:
 *   green  →  -60 … -24 dB   (ratio 0 – 0.60)
 *   yellow →  -24 … -12 dB   (ratio 0.60 – 0.80)
 *   amber  →  -12 … -6 dB    (ratio 0.80 – 0.90)
 *   red    →   -6 …  0 dB    (ratio 0.90+)
 */
function meterColor(ratio: number): string {
  if (ratio > 0.9) return "#ef4444"; // red – clipping
  if (ratio > 0.8) return "#f59e0b"; // amber – hot
  if (ratio > 0.6) return "#eab308"; // yellow – healthy
  return "#22c55e"; // green – nominal
}

function LevelMeterImpl({
  level,
  width = "100%",
  height = "6px",
  className = "",
  showDb = false,
  variant = "themed",
}: LevelMeterProps) {
  const ratio = linearToMeter(level);
  const pct = `${(ratio * 100).toFixed(1)}%`;
  const color = meterColor(ratio);
  const dbText = level > 0 ? `${(20 * Math.log10(level)).toFixed(0)} dB` : "-∞ dB";

  const isOverlay = variant === "overlay";

  const trackClass = isOverlay
    ? "relative overflow-hidden rounded-sm"
    : "relative overflow-hidden rounded-sm bg-muted border border-border";
  const trackStyle: React.CSSProperties = isOverlay
    ? {
        width,
        height,
        backgroundColor: "rgba(255,255,255,0.18)",
        border: "1px solid rgba(255,255,255,0.15)",
      }
    : { width, height };
  const dbClass = isOverlay
    ? "min-w-[3.5rem] text-right text-[0.65rem] tabular-nums text-white/50"
    : "min-w-[3.5rem] text-right text-[0.65rem] tabular-nums text-muted-foreground";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={trackClass} style={trackStyle}>
        <div className="absolute inset-y-0 left-0" style={{ width: pct, backgroundColor: color }} />
      </div>
      {showDb && <span className={dbClass}>{dbText}</span>}
    </div>
  );
}

export const LevelMeter = memo(LevelMeterImpl);
