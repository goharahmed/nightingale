import {
  BASE_DISPLAY_HEIGHT,
  BASE_DISPLAY_WIDTH,
  PITCH_BUFFER_SIZE,
  REFERENCE_HEIGHT,
} from "@/lib/pitch/constants";
import type { PitchSeries } from "@/lib/pitch/state";
import { freqToSemitone, snapToRefOctave } from "@/lib/pitch/state";
import { useEffect, useRef, useState } from "react";

function displayScale(windowHeight: number): number {
  return Math.max(0.85, windowHeight / REFERENCE_HEIGHT);
}

function similarityToRgb(sim: number): { r: number; g: number; b: number } {
  const good = { r: 0.2, g: 0.9, b: 0.3 };
  const ok = { r: 0.95, g: 0.8, b: 0.1 };
  const bad = { r: 0.9, g: 0.2, b: 0.2 };

  if (sim >= 0.7) {
    const t = (sim - 0.7) / 0.3;
    return {
      r: ok.r + (good.r - ok.r) * t,
      g: ok.g + (good.g - ok.g) * t,
      b: ok.b + (good.b - ok.b) * t,
    };
  }

  const t = Math.max(0, sim / 0.7);

  return {
    r: bad.r + (ok.r - bad.r) * t,
    g: bad.g + (ok.g - bad.g) * t,
    b: bad.b + (ok.b - bad.b) * t,
  };
}

function lerpRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

interface PitchGraphProps {
  series: PitchSeries;
  visible: boolean;
}

export function PitchGraph({ series, visible }: PitchGraphProps) {
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

    const len = series.refPitches.length;
    if (len < 2) {
      return;
    }

    const xStep = plotW / (PITCH_BUFFER_SIZE - 1);
    const xStart = padX;
    const bufOffset = PITCH_BUFFER_SIZE - len;
    const xFor = (i: number) => xStart + (bufOffset + i) * xStep;
    const ageAlpha = (i: number) => 0.25 + 0.75 * (i / Math.max(1, len - 1));

    const refColor = { r: 0.5, g: 0.7, b: 1.0 };

    const flushRun = (run: { x: number; y: number; a: number }[]) => {
      if (run.length < 2) {
        run.length = 0;
        return;
      }
      ctx.beginPath();
      ctx.moveTo(run[0].x, run[0].y);
      for (let k = 1; k < run.length; k++) {
        ctx.lineTo(run[k].x, run[k].y);
      }
      ctx.strokeStyle = `rgba(${Math.round(refColor.r * 255)},${Math.round(refColor.g * 255)},${Math.round(refColor.b * 255)},${run[0].a})`;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      run.length = 0;
    };

    const refRun: { x: number; y: number; a: number }[] = [];
    for (let i = 0; i < len; i++) {
      const hz = series.refPitches[i];
      if (hz != null) {
        const a = 0.55 * ageAlpha(i);
        refRun.push({
          x: xFor(i),
          y: semiToY(freqToSemitone(hz)),
          a,
        });
      } else {
        flushRun(refRun);
      }
    }
    flushRun(refRun);

    const userBase = { r: 0.85, g: 0.85, b: 1.0 };
    const userRun: {
      x: number;
      y: number;
      r: number;
      g: number;
      b: number;
      a: number;
    }[] = [];

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
      const g = ctx.createLinearGradient(userRun[0].x, 0, userRun[userRun.length - 1].x, 0);
      for (let k = 0; k < userRun.length; k++) {
        g.addColorStop(
          k / (userRun.length - 1),
          `rgba(${Math.round(userRun[k].r * 255)},${Math.round(userRun[k].g * 255)},${Math.round(userRun[k].b * 255)},${userRun[k].a})`,
        );
      }
      ctx.strokeStyle = g;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      userRun.length = 0;
    };

    for (let i = 0; i < len; i++) {
      const userHz = series.userPitches[i];
      if (userHz != null) {
        const userSemi = freqToSemitone(userHz);
        const refHz = series.refPitches[i];
        const displaySemi =
          refHz != null ? snapToRefOctave(freqToSemitone(refHz), userSemi) : userSemi;
        const sim = series.similarities[i] ?? 0;
        const hasRef = refHz != null;
        const age = ageAlpha(i);
        const prox = similarityToRgb(sim);
        const base = hasRef ? lerpRgb(userBase, prox, sim) : userBase;
        const alpha = hasRef ? (0.35 + sim * 0.65) * age : 0.55 * age;
        userRun.push({
          x: xFor(i),
          y: semiToY(displaySemi),
          r: base.r,
          g: base.g,
          b: base.b,
          a: alpha,
        });
      } else {
        flushUser();
      }
    }
    flushUser();
  }, [series, visible, innerHeight]);

  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-none top-3 absolute left-1/2 z-20 -translate-x-1/2 rounded-sm border-white/15 bg-black/40 p-1">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
