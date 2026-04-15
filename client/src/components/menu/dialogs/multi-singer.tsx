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
  type MultiSingerMetadata,
} from "@/tauri-bridge/playback";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const DEFAULT_META: MultiSingerMetadata = {
  singer_1_label: "Male",
  singer_2_label: "Female",
  swap_references: false,
  default_multi_singer_mode: true,
};

export const MultiSingerDialog = () => {
  const { mode, close } = useDialog();
  const { analyzeMultiSinger } = useAnalysis();
  const payload = mode && typeof mode === "object" && mode.mode === "multi-singer" ? mode : null;
  const song = payload?.song;
  const open = payload !== null;

  const [meta, setMeta] = useState<MultiSingerMetadata>(DEFAULT_META);
  const [hasStems, setHasStems] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ s1: string; s2: string } | null>(null);

  useEffect(() => {
    if (!open || !song) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [paths, existing] = await Promise.all([
          getMultiSingerAudioPaths(song.file_hash),
          loadMultiSingerMetadata(song.file_hash),
        ]);
        if (cancelled) return;
        setHasStems(Boolean(paths));
        setPreview(paths ? { s1: paths.singer_1, s2: paths.singer_2 } : null);
        setMeta(existing ?? DEFAULT_META);
      } catch (err) {
        toast.error(`Failed to load multi-singer data: ${String(err)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, song]);

  const summaryText = useMemo(() => {
    if (!hasStems) return "No multi-singer stems are available for this song yet.";
    const order = meta.swap_references ? "Singer 1/2 references are swapped." : "Normal track mapping.";
    return `Singer 1: ${meta.singer_1_label}, Singer 2: ${meta.singer_2_label}. ${order}`;
  }, [hasStems, meta]);

  if (!song) return null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Multi-Singer Analysis</DialogTitle>
          <DialogDescription>
            Review duet split tracks, tag singer roles, and choose the default playback mode.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label>Song</Label>
            <FieldDescription>
              {song.title} - {song.artist}
            </FieldDescription>
          </Field>

          {!hasStems && !loading && (
            <Field>
              <Label>Generate split tracks</Label>
              <FieldDescription>
                This creates singer-1 and singer-2 vocal references for duet scoring and routing.
              </FieldDescription>
              <Button
                disabled={busy}
                onClick={async () => {
                  try {
                    setBusy(true);
                    await analyzeMultiSinger(song.file_hash);
                    const paths = await getMultiSingerAudioPaths(song.file_hash);
                    setHasStems(Boolean(paths));
                    setPreview(paths ? { s1: paths.singer_1, s2: paths.singer_2 } : null);
                    toast.success("Multi-singer stems generated.");
                  } catch (err) {
                    toast.error(`Multi-singer analysis failed: ${String(err)}`);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Run Multi-Singer Analysis
              </Button>
            </Field>
          )}

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
                    onCheckedChange={(v) => setMeta((prev) => ({ ...prev, swap_references: v }))}
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
                    onCheckedChange={(v) =>
                      setMeta((prev) => ({ ...prev, default_multi_singer_mode: v }))
                    }
                  />
                </div>
              </Field>
              {preview && (
                <Field>
                  <Label>Track preview</Label>
                  <FieldDescription>Quickly audition detected singer stems.</FieldDescription>
                  <div className="space-y-2">
                    <audio controls className="w-full" src={preview.s1} />
                    <audio controls className="w-full" src={preview.s2} />
                  </div>
                </Field>
              )}
            </>
          )}

          <FieldDescription>{loading ? "Loading..." : summaryText}</FieldDescription>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
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
