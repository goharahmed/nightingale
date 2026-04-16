import {
  BASE_DISPLAY_HEIGHT,
  BASE_DISPLAY_WIDTH,
  PITCH_BUFFER_SIZE,
  REF_LOOKAHEAD_ENTRIES,
  REFERENCE_HEIGHT,
} from "@/lib/pitch/constants";
import type { PitchSeriesWithLookahead } from "@/lib/pitch/state";
import { freqToSemitone, snapToRefOctave } from "@/lib/pitch/state";
import { memo, useEffect, useRef } from "react";

function displayScale(windowHeight: number): number {
  return Math.max(0.85, windowHeight / REFERENCE_HEIGHT);
}

const TOTAL_ENTRIES = PITCH_BUFFER_SIZE + REF_LOOKAHEAD_ENTRIES;

interface PitchGraphProps {
  series: PitchSeriesWithLookahead;
  visible: boolean;
  refColor?: { r: number; g: number; b: number };
  label?: string;
  className?: string;
}

const DEFAULT_REF_COLOR = { r: 51, g: 217, b: 89 };

export const PitchGraph = memo(function PitchGraph({
  series,
  visible,
  refColor,
  label,
  className,
}: PitchGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seriesRef = useRef(series);
  seriesRef.current = series;

  const refColorRef = useRef(refColor);
  refColorRef.current = refColor;

  useEffect(() => {
    if (!visible) return;

    let rafId = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const s = seriesRef.current;
      const dpr = window.devicePixelRatio || 1;
      const wh = window.innerHeight;
      const scale = displayScale(wh);
      const dw = BASE_DISPLAY_WIDTH * scale;
      const dh = BASE_DISPLAY_HEIGHT * scale;
      const padX = 8 * scale;
      const padY = 6 * scale;
      const lineWidth = Math.max(2.25, 2 * scale);

      const plotW = dw - padX * 2;
      const plotH = dh - padY * 2;

      const needsResize =
        canvas.width !== Math.floor(dw * dpr) || canvas.height !== Math.floor(dh * dpr);
      if (needsResize) {
        canvas.width = Math.floor(dw * dpr);
        canvas.height = Math.floor(dh * dpr);
        canvas.style.width = `${dw}px`;
        canvas.style.height = `${dh}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, dw, dh);

      const centerY = padY + plotH / 2;
      const semiToY = (semi: number) => {
        const normalized = Math.min(1, Math.max(0, (semi - 45) / 36));
        return centerY + plotH / 2 - normalized * plotH;
      };

      const bufLen = s.refPitches.length;
      const lookaheadLen = s.lookaheadRefPitches.length;
      const totalRefLen = bufLen + lookaheadLen;

      if (totalRefLen < 2 && bufLen < 2) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const xStep = plotW / (TOTAL_ENTRIES - 1);
      const xStart = padX;
      const bufOffset = PITCH_BUFFER_SIZE - bufLen;
      const bufXFor = (i: number) => xStart + (bufOffset + i) * xStep;
      const lookaheadXFor = (j: number) => xStart + (PITCH_BUFFER_SIZE + j) * xStep;

      const rc = refColorRef.current ?? DEFAULT_REF_COLOR;
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

      for (let i = 0; i < bufLen; i++) {
        const hz = s.refPitches[i];
        if (hz != null) {
          refRun.push({ x: bufXFor(i), y: semiToY(freqToSemitone(hz)), a: refAgeAlpha(i) });
        } else {
          flushRef();
        }
      }
      for (let j = 0; j < lookaheadLen; j++) {
        const hz = s.lookaheadRefPitches[j];
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
        const userHz = s.userPitches[i];
        if (userHz != null) {
          const userSemi = freqToSemitone(userHz);
          const refHz = s.refPitches[i];
          const displaySemi =
            refHz != null ? snapToRefOctave(freqToSemitone(refHz), userSemi) : userSemi;
          userRun.push({ x: bufXFor(i), y: semiToY(displaySemi), a: userAgeAlpha(i) });
        } else {
          flushUser();
        }
      }
      flushUser();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [visible]);

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
});
