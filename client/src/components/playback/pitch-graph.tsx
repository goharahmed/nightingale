import {
  BASE_DISPLAY_HEIGHT,
  BASE_DISPLAY_WIDTH,
  PITCH_BUFFER_SIZE,
  REF_LOOKAHEAD_ENTRIES,
  REFERENCE_HEIGHT,
} from "@/lib/pitch/constants";
import type { PitchSeriesWithLookahead } from "@/lib/pitch/state";
import { freqToSemitone, snapToRefOctave } from "@/lib/pitch/state";
import { useEffect, useRef, useState } from "react";

function displayScale(windowHeight: number): number {
  return Math.max(0.85, windowHeight / REFERENCE_HEIGHT);
}

/** Total display slots: past buffer + future lookahead. */
const TOTAL_ENTRIES = PITCH_BUFFER_SIZE + REF_LOOKAHEAD_ENTRIES;

interface PitchGraphProps {
  series: PitchSeriesWithLookahead;
  visible: boolean;
  /** RGB tuple for the reference pitch line. Defaults to green (51, 217, 89). */
  refColor?: { r: number; g: number; b: number };
  /** Optional label shown in the top-left corner of the graph. */
  label?: string;
  /** Additional CSS class for positioning. */
  className?: string;
}

const DEFAULT_REF_COLOR = { r: 51, g: 217, b: 89 };

export function PitchGraph({ series, visible, refColor, label, className }: PitchGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [innerHeight, setInnerHeight] = useState(() => window.innerHeight);

  useEffect(() => {
    const onResize = () => setInnerHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const wh = innerHeight;
    const scale = displayScale(wh);
    const dw = BASE_DISPLAY_WIDTH * scale;
    const dh = BASE_DISPLAY_HEIGHT * scale;
    const padX = 8 * scale;
    const padY = 6 * scale;
    const lineWidth = Math.max(2.25, 2 * scale);

    const plotW = dw - padX * 2;
    const plotH = dh - padY * 2;

    canvas.width = Math.floor(dw * dpr);
    canvas.height = Math.floor(dh * dpr);
    canvas.style.width = `${dw}px`;
    canvas.style.height = `${dh}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, dw, dh);

    const centerY = padY + plotH / 2;
    const semiToY = (semi: number) => {
      const normalized = Math.min(1, Math.max(0, (semi - 45) / 36));
      return centerY + plotH / 2 - normalized * plotH;
    };

    // Buffer data (shared between ref and user)
    const bufLen = series.refPitches.length;
    const lookaheadLen = series.lookaheadRefPitches.length;
    const totalRefLen = bufLen + lookaheadLen;

    if (totalRefLen < 2 && bufLen < 2) {
      return;
    }

    // X-axis spans TOTAL_ENTRIES positions.
    // User data occupies positions 0..PITCH_BUFFER_SIZE-1 (left portion).
    // Lookahead extends to positions PITCH_BUFFER_SIZE..TOTAL_ENTRIES-1 (right portion).
    const xStep = plotW / (TOTAL_ENTRIES - 1);
    const xStart = padX;

    // Buffer entries are right-aligned within the user portion (0..PITCH_BUFFER_SIZE-1)
    const bufOffset = PITCH_BUFFER_SIZE - bufLen;
    const bufXFor = (i: number) => xStart + (bufOffset + i) * xStep;

    // Lookahead entries start at position PITCH_BUFFER_SIZE
    const lookaheadXFor = (j: number) => xStart + (PITCH_BUFFER_SIZE + j) * xStep;

    // --- Reference pitch line (uses configurable color, extends into lookahead) ---
    const rc = refColor ?? DEFAULT_REF_COLOR;
    const refAgeAlpha = (k: number) => 0.25 + 0.75 * (k / Math.max(1, totalRefLen - 1));

    const refRun: { x: number; y: number; a: number }[] = [];

    const flushRef = () => {
      if (refRun.length < 2) {
        refRun.length = 0;
        return;
      }
      ctx.beginPath();
      ctx.moveTo(refRun[0].x, refRun[0].y);
      for (let k = 1; k < refRun.length; k++) {
        ctx.lineTo(refRun[k].x, refRun[k].y);
      }
      const grad = ctx.createLinearGradient(refRun[0].x, 0, refRun[refRun.length - 1].x, 0);
      for (let k = 0; k < refRun.length; k++) {
        grad.addColorStop(
          k / (refRun.length - 1),
          `rgba(${rc.r},${rc.g},${rc.b},${0.75 * refRun[k].a})`,
        );
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      refRun.length = 0;
    };

    // Buffer portion of ref line
    for (let i = 0; i < bufLen; i++) {
      const hz = series.refPitches[i];
      if (hz != null) {
        refRun.push({ x: bufXFor(i), y: semiToY(freqToSemitone(hz)), a: refAgeAlpha(i) });
      } else {
        flushRef();
      }
    }
    // Lookahead portion of ref line (continues seamlessly)
    for (let j = 0; j < lookaheadLen; j++) {
      const hz = series.lookaheadRefPitches[j];
      if (hz != null) {
        refRun.push({
          x: lookaheadXFor(j),
          y: semiToY(freqToSemitone(hz)),
          a: refAgeAlpha(bufLen + j),
        });
      } else {
        flushRef();
      }
    }
    flushRef();

    // --- User pitch line (steady light grey, buffer portion only) ---
    const userColor = { r: 217, g: 217, b: 217 };
    const userAgeAlpha = (i: number) => 0.25 + 0.75 * (i / Math.max(1, bufLen - 1));
    const userRun: { x: number; y: number; a: number }[] = [];

    const flushUser = () => {
      if (userRun.length < 2) {
        userRun.length = 0;
        return;
      }
      ctx.beginPath();
      ctx.moveTo(userRun[0].x, userRun[0].y);
      for (let k = 1; k < userRun.length; k++) {
        ctx.lineTo(userRun[k].x, userRun[k].y);
      }
      const grad = ctx.createLinearGradient(userRun[0].x, 0, userRun[userRun.length - 1].x, 0);
      for (let k = 0; k < userRun.length; k++) {
        grad.addColorStop(
          k / (userRun.length - 1),
          `rgba(${userColor.r},${userColor.g},${userColor.b},${0.7 * userRun[k].a})`,
        );
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      userRun.length = 0;
    };

    for (let i = 0; i < bufLen; i++) {
      const userHz = series.userPitches[i];
      if (userHz != null) {
        const userSemi = freqToSemitone(userHz);
        const refHz = series.refPitches[i];
        const displaySemi =
          refHz != null ? snapToRefOctave(freqToSemitone(refHz), userSemi) : userSemi;
        userRun.push({ x: bufXFor(i), y: semiToY(displaySemi), a: userAgeAlpha(i) });
      } else {
        flushUser();
      }
    }
    flushUser();
  }, [series, visible, innerHeight, refColor]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={
        className ??
        "pointer-events-none top-3 absolute left-1/2 z-20 -translate-x-1/2 rounded-sm border-white/15 bg-black/40 p-1"
      }
    >
      {label && (
        <span className="absolute left-2 top-0.5 text-[0.55rem] font-medium text-white/50">
          {label}
        </span>
      )}
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
