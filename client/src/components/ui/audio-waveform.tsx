import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ── RMS computation ────────────────────────────────────────────────────

/** Downmix all channels to mono, then compute RMS for `bucketCount` buckets. */
function computeRms(buffer: AudioBuffer, bucketCount: number): Float32Array {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;

  // Downmix to mono
  const mono = new Float32Array(length);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i];
    }
  }
  if (channels > 1) {
    const scale = 1 / channels;
    for (let i = 0; i < length; i++) {
      mono[i] *= scale;
    }
  }

  const samplesPerBucket = Math.floor(length / bucketCount);
  const rms = new Float32Array(bucketCount);

  for (let b = 0; b < bucketCount; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(start + samplesPerBucket, length);
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += mono[i] * mono[i];
    }
    rms[b] = Math.sqrt(sum / (end - start));
  }

  return rms;
}

/** Normalize RMS values to 0..1 range. */
function normalizeRms(rms: Float32Array): Float32Array {
  let max = 0;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] > max) max = rms[i];
  }
  if (max === 0) return rms;
  const result = new Float32Array(rms.length);
  for (let i = 0; i < rms.length; i++) {
    result[i] = rms[i] / max;
  }
  return result;
}

// ── Format helpers ─────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Component ──────────────────────────────────────────────────────────

interface AudioWaveformProps {
  /** URL of the audio file to visualise and play. */
  src: string;
  /** Accent colour for the played portion of the waveform. */
  color?: string;
  /** Height of the waveform area in pixels. */
  height?: number;
  /** Number of RMS buckets (bars) to render. */
  buckets?: number;
  /** Extra class names on the outer wrapper. */
  className?: string;
  /** Label shown above the waveform (e.g. "Singer 1"). */
  label?: string;
}

export function AudioWaveform({
  src,
  color = "#60a5fa",
  height = 48,
  buckets = 120,
  className,
  label,
}: AudioWaveformProps) {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);

  // Refs for Web Audio playback
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0); // wall-clock when playback started
  const startOffsetRef = useRef(0); // offset into buffer when playback started
  const rafRef = useRef<number>(0);
  const playingRef = useRef(false);

  // Decode audio buffer on mount / src change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAudioBuffer(null);
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);

    (async () => {
      try {
        const resp = await fetch(src);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const arrayBuf = await resp.arrayBuffer();
        if (cancelled) return;
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(arrayBuf);
        await ctx.close();
        if (cancelled) return;
        setAudioBuffer(buf);
        setDuration(buf.duration);
      } catch (e) {
        console.warn("[AudioWaveform] Failed to decode:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Compute normalised RMS bars
  const rms = useMemo(() => {
    if (!audioBuffer) return null;
    return normalizeRms(computeRms(audioBuffer, buckets));
  }, [audioBuffer, buckets]);

  // ── Playback controls ────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    try {
      sourceRef.current?.stop();
    } catch {
      /* noop */
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const startPlayback = useCallback(
    (offset: number) => {
      if (!audioBuffer) return;

      // Ensure we have an AudioContext
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;

      // Stop any existing source
      try {
        sourceRef.current?.stop();
      } catch {
        /* noop */
      }
      sourceRef.current?.disconnect();

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (playingRef.current) {
          stopPlayback();
          setCurrentTime(duration);
        }
      };
      source.start(0, offset);
      sourceRef.current = source;
      startTimeRef.current = ctx.currentTime;
      startOffsetRef.current = offset;
      playingRef.current = true;
      setPlaying(true);

      // Update time via rAF
      const tick = () => {
        if (!playingRef.current) return;
        const elapsed = ctx.currentTime - startTimeRef.current;
        setCurrentTime(Math.min(startOffsetRef.current + elapsed, duration));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [audioBuffer, duration, stopPlayback],
  );

  const togglePlay = useCallback(() => {
    if (playing) {
      // Save current position before stopping
      if (audioCtxRef.current) {
        const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
        startOffsetRef.current = Math.min(startOffsetRef.current + elapsed, duration);
      }
      stopPlayback();
      setCurrentTime(startOffsetRef.current);
    } else {
      // Resume from saved offset
      const offset = currentTime >= duration ? 0 : startOffsetRef.current;
      startPlayback(offset);
    }
  }, [playing, currentTime, duration, startPlayback, stopPlayback]);

  const seekTo = useCallback(
    (fraction: number) => {
      const time = fraction * duration;
      startOffsetRef.current = time;
      setCurrentTime(time);
      if (playing) {
        startPlayback(time);
      }
    },
    [duration, playing, startPlayback],
  );

  // ── Click-to-seek on waveform ────────────────────────────────────────
  const waveformRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!waveformRef.current || !audioBuffer) return;
      const rect = waveformRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(fraction);
    },
    [audioBuffer, seekTo],
  );

  // ── Progress fraction ────────────────────────────────────────────────
  const progressFraction = duration > 0 ? currentTime / duration : 0;

  // ── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2", className)}>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading waveform…</span>
      </div>
    );
  }

  if (!rms) {
    return (
      <div
        className={cn("rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground", className)}
      >
        Could not decode audio
      </div>
    );
  }

  const barGap = 1;
  const barWidth = Math.max(1, (100 - barGap * (buckets - 1)) / buckets);

  return (
    <div className={cn("select-none space-y-1", className)}>
      {/* Waveform bars */}
      <div
        ref={waveformRef}
        className="relative cursor-pointer overflow-hidden rounded-md bg-muted/40"
        style={{ height }}
        onPointerDown={handlePointerDown}
        role="slider"
        aria-label={label ? `${label} audio position` : "Audio position"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressFraction * 100)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") seekTo(Math.max(0, progressFraction - 0.02));
          if (e.key === "ArrowRight") seekTo(Math.min(1, progressFraction + 0.02));
          if (e.key === " ") {
            e.preventDefault();
            togglePlay();
          }
        }}
      >
        <svg
          viewBox={`0 0 ${buckets} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {Array.from({ length: buckets }, (_, i) => {
            const value = rms[i];
            // Minimum bar height so silent regions are still visible
            const barH = Math.max(1.5, value * (height - 2));
            const y = height - barH;
            const isPast = i / buckets < progressFraction;

            return (
              <rect
                key={i}
                x={i * (barWidth + barGap) * (buckets / 100)}
                y={y}
                width={Math.max(0.8, barWidth * (buckets / 100) - 0.2)}
                height={barH}
                rx={0.5}
                fill={isPast ? color : "currentColor"}
                className={isPast ? "" : "text-muted-foreground/30"}
              />
            );
          })}
        </svg>

        {/* Playback cursor line */}
        <div
          className="pointer-events-none absolute top-0 h-full w-px"
          style={{
            left: `${progressFraction * 100}%`,
            backgroundColor: color,
            boxShadow: `0 0 4px ${color}`,
          }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted-foreground/20"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="1" width="3" height="10" rx="0.5" />
              <rect x="7" y="1" width="3" height="10" rx="0.5" />
            </svg>
          ) : (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 1.5v9l7-4.5z" />
            </svg>
          )}
        </button>

        {label && (
          <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        )}

        <span className="ml-auto whitespace-nowrap font-mono text-[0.65rem] tabular-nums text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
