import { AudioWaveform } from "@/components/ui/audio-waveform";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAnalysis } from "@/hooks/use-analysis";
import { useDialog } from "@/hooks/use-dialog";
import {
  getMultiSingerAudioPaths,
  loadMultiSingerMetadata,
  saveMultiSingerMetadata,
  getMediaPort,
  type DiarizationSegment,
  type MultiSingerMetadata,
} from "@/tauri-bridge/playback";
import { joinMediaUrl } from "@/adapters/playback";
import {
  onMultiSingerDone,
  onMultiSingerProgress,
  type MultiSingerDone,
} from "@/tauri-bridge/analysis";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const DEFAULT_META: MultiSingerMetadata = {
  singer_1_label: "Singer 1",
  singer_2_label: "Singer 2",
  swap_references: false,
  default_multi_singer_mode: true,
};

const SPEAKER_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24"];

// ── Timeline component ────────────────────────────────────────────────

interface TimelineProps {
  segments: DiarizationSegment[];
  speakerIds: string[];
  duration: number;
  labels: [string, string];
}

function DiarizationTimeline({ segments, speakerIds, duration, labels }: TimelineProps) {
  if (duration <= 0 || segments.length === 0) return null;

  const speakerColorMap = new Map<string, string>();
  speakerIds.forEach((id, i) => {
    speakerColorMap.set(id, SPEAKER_COLORS[i % SPEAKER_COLORS.length]);
  });

  return (
    <div className="space-y-2">
      <div className="relative h-10 w-full overflow-hidden rounded-md bg-muted">
        {segments.map((seg, i) => {
          const left = (seg.start / duration) * 100;
          const width = ((seg.end - seg.start) / duration) * 100;
          const color = speakerColorMap.get(seg.speaker) ?? "#94a3b8";
          return (
            <div
              key={i}
              className="absolute top-0 h-full transition-opacity hover:opacity-80"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.3)}%`,
                backgroundColor: color,
                opacity: 0.7,
              }}
              title={`${seg.speaker}: ${seg.start.toFixed(1)}s – ${seg.end.toFixed(1)}s`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {speakerIds.slice(0, 2).map((id, i) => (
          <div key={id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }}
            />
            <span>{labels[i as 0 | 1] || id}</span>
          </div>
        ))}
        <span className="ml-auto tabular-nums">{Math.round(duration)}s</span>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────

function ProgressBar({ percent, message }: { percent: number; message: string }) {
  return (
    <div className="space-y-1.5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{message || "Processing..."}</p>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────

export const MultiSingerDialog = () => {
  const { mode, close } = useDialog();
  const { analyzeMultiSinger, invalidateSongs } = useAnalysis();
  const payload = mode && typeof mode === "object" && mode.mode === "multi-singer" ? mode : null;
  const song = payload?.song;
  const open = payload !== null;

  const [meta, setMeta] = useState<MultiSingerMetadata>(DEFAULT_META);
  const [hasStems, setHasStems] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null);
  const [preview, setPreview] = useState<{ s1: string; s2: string } | null>(null);
  const busyHashRef = useRef<string | null>(null);

  const reloadData = useCallback(async (fileHash: string) => {
    const [paths, existing, port] = await Promise.all([
      getMultiSingerAudioPaths(fileHash),
      loadMultiSingerMetadata(fileHash),
      getMediaPort(),
    ]);
    setHasStems(Boolean(paths));
    if (paths) {
      const base = `http://127.0.0.1:${port}`;
      setPreview({
        s1: joinMediaUrl(base, paths.singer_1),
        s2: joinMediaUrl(base, paths.singer_2),
      });
    } else {
      setPreview(null);
    }
    setMeta(existing ?? DEFAULT_META);
  }, []);

  useEffect(() => {
    if (!open || !song) return;
    let cancelled = false;
    setLoading(true);

    reloadData(song.file_hash)
      .catch((err) => toast.error(`Failed to load multi-singer data: ${String(err)}`))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, song, reloadData]);

  // Listen for progress + done events
  useEffect(() => {
    if (!open) return;

    const unlisteners: (() => void)[] = [];

    onMultiSingerProgress((evt) => {
      if (busyHashRef.current && evt.file_hash === busyHashRef.current) {
        setProgress({ percent: evt.percent, message: evt.message });
      }
    }).then((u) => unlisteners.push(u));

    onMultiSingerDone((evt: MultiSingerDone) => {
      if (busyHashRef.current && evt.file_hash === busyHashRef.current) {
        busyHashRef.current = null;
        setBusy(false);
        setProgress(null);

        if (evt.error) {
          toast.error(`Multi-singer analysis failed: ${evt.error}`);
        } else {
          const method = evt.used_ml ? "ML diarization" : "frequency split";
          toast.success(`Multi-singer stems generated (${method}).`);
          reloadData(evt.file_hash).catch(() => {});
          invalidateSongs();
        }
      }
    }).then((u) => unlisteners.push(u));

    return () => {
      for (const u of unlisteners) u();
    };
  }, [open, reloadData, invalidateSongs]);

  const summaryText = useMemo(() => {
    if (!hasStems) return "No multi-singer stems are available for this song yet.";
    const hasDiarization = meta.segments && meta.segments.length > 0;
    const method = hasDiarization ? "ML diarization" : "frequency split";
    const order = meta.swap_references ? "Singer references are swapped." : "Normal track mapping.";
    const speakers = meta.speaker_count ? `${meta.speaker_count} speaker(s) detected.` : "";
    return `${meta.singer_1_label} / ${meta.singer_2_label}. ${speakers} ${order} (${method})`;
  }, [hasStems, meta]);

  if (!song) return null;

  const handleRunAnalysis = async () => {
    setBusy(true);
    busyHashRef.current = song.file_hash;
    setProgress({ percent: 0, message: "Starting analysis..." });
    try {
      await analyzeMultiSinger(song.file_hash);
    } catch {
      setBusy(false);
      busyHashRef.current = null;
      setProgress(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        if (!busy) close();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Multi-Singer Analysis</DialogTitle>
          <DialogDescription>
            Detect and separate individual singers from the vocal track using speaker diarization.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label>Song</Label>
            <FieldDescription>
              {song.title} — {song.artist}
            </FieldDescription>
          </Field>

          {/* Generation / re-generation */}
          {!loading && (
            <Field>
              <Label>{hasStems ? "Regenerate split tracks" : "Generate split tracks"}</Label>
              <FieldDescription>
                {hasStems
                  ? "Re-run analysis to update the singer stems (e.g. after full reanalysis)."
                  : "Creates singer-1 and singer-2 vocal references for duet scoring and routing."}
              </FieldDescription>
              <Button disabled={busy} onClick={handleRunAnalysis}>
                {hasStems ? "Re-run Multi-Singer Analysis" : "Run Multi-Singer Analysis"}
              </Button>
            </Field>
          )}

          {/* Progress indicator */}
          {busy && progress && (
            <Field>
              <ProgressBar percent={progress.percent} message={progress.message} />
            </Field>
          )}

          {/* Diarization timeline */}
          {hasStems && meta.segments && meta.segments.length > 0 && (
            <Field>
              <Label>Speaker timeline</Label>
              <FieldDescription>
                Colored regions show when each detected speaker is singing.
              </FieldDescription>
              <DiarizationTimeline
                segments={meta.segments}
                speakerIds={meta.speaker_ids ?? []}
                duration={song.duration_secs}
                labels={[meta.singer_1_label, meta.singer_2_label]}
              />
            </Field>
          )}

          {/* Stem configuration */}
          {hasStems && (
            <>
              <Field>
                <Label>Singer 1 label</Label>
                <Input
                  value={meta.singer_1_label}
                  onChange={(e) => setMeta((prev) => ({ ...prev, singer_1_label: e.target.value }))}
                  placeholder="Male / Singer-1"
                />
              </Field>
              <Field>
                <Label>Singer 2 label</Label>
                <Input
                  value={meta.singer_2_label}
                  onChange={(e) => setMeta((prev) => ({ ...prev, singer_2_label: e.target.value }))}
                  placeholder="Female / Singer-2"
                />
              </Field>
              <Field>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <Label>Swap singer references</Label>
                    <FieldDescription>
                      Use this if singer-1 and singer-2 were detected in reverse.
                    </FieldDescription>
                  </div>
                  <Switch
                    checked={meta.swap_references}
                    onCheckedChange={(v: boolean) =>
                      setMeta((prev) => ({ ...prev, swap_references: v }))
                    }
                  />
                </div>
              </Field>
              <Field>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <Label>Default to Multi-Singer mode</Label>
                    <FieldDescription>
                      Playback opens in duet mode by default for this song.
                    </FieldDescription>
                  </div>
                  <Switch
                    checked={meta.default_multi_singer_mode}
                    onCheckedChange={(v: boolean) =>
                      setMeta((prev) => ({ ...prev, default_multi_singer_mode: v }))
                    }
                  />
                </div>
              </Field>
              {preview && (
                <Field>
                  <Label>Track preview</Label>
                  <FieldDescription>
                    Click the waveform to seek. Colored bars show where each singer has audio
                    content.
                  </FieldDescription>
                  <div className="space-y-3">
                    <AudioWaveform
                      src={preview.s1}
                      color={SPEAKER_COLORS[0]}
                      label={meta.singer_1_label || "Singer 1"}
                      height={48}
                    />
                    <AudioWaveform
                      src={preview.s2}
                      color={SPEAKER_COLORS[1]}
                      label={meta.singer_2_label || "Singer 2"}
                      height={48}
                    />
                  </div>
                </Field>
              )}
            </>
          )}

          <FieldDescription>{loading ? "Loading..." : summaryText}</FieldDescription>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Close
          </Button>
          <Button
            disabled={!hasStems || busy || loading}
            onClick={async () => {
              try {
                await saveMultiSingerMetadata(song.file_hash, meta);
                toast.success("Multi-singer settings saved.");
                close();
              } catch (err) {
                toast.error(`Failed to save metadata: ${String(err)}`);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
