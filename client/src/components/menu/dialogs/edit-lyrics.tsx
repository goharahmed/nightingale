import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DialogMode, useDialog } from "@/hooks/use-dialog";
import { useDialogNav } from "@/hooks/navigation/use-dialog-nav";
import { loadTranscript, saveTranscript } from "@/tauri-bridge/playback";
import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Song } from "@/types/Song";
import type { Transcript, Segment } from "@/types/Transcript";

export function isEditLyricsMode(mode: DialogMode): mode is { mode: "edit-lyrics"; song: Song } {
  return mode !== null && typeof mode === "object" && "mode" in mode && mode.mode === "edit-lyrics";
}

/** Convert a transcript's segments into a flat text string for editing. */
function segmentsToText(segments: Segment[]): string {
  return segments.map((seg) => seg.text.trim()).join("\n");
}

/**
 * Re-apply edited text back into the transcript segments.
 * Each line of text maps 1:1 to the original segment; extra lines are appended as new segments.
 * If fewer lines are provided, excess segments are removed.
 */
function applyTextToTranscript(transcript: Transcript, newText: string): Transcript {
  const lines = newText.split("\n");
  const newSegments: Segment[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    if (i < transcript.segments.length) {
      const orig = transcript.segments[i];
      // Update text while preserving timing
      newSegments.push({
        ...orig,
        text: lineText,
        words: lineText
          .split(/\s+/)
          .filter(Boolean)
          .map((word, wi, arr) => {
            // Distribute timing evenly across new words, falling back to segment timing
            const segDuration = orig.end - orig.start;
            const wordDuration = segDuration / arr.length;
            const origWord = orig.words[wi];
            return {
              word,
              start: origWord?.start ?? orig.start + wi * wordDuration,
              end: origWord?.end ?? orig.start + (wi + 1) * wordDuration,
              score: origWord?.score,
            };
          }),
      });
    } else {
      // New line beyond original segment count — append with timing from last segment
      const lastSeg = newSegments[newSegments.length - 1];
      const start = lastSeg ? lastSeg.end : 0;
      const end = start + 3; // default 3s per new segment
      newSegments.push({
        text: lineText,
        start,
        end,
        words: lineText
          .split(/\s+/)
          .filter(Boolean)
          .map((word, wi, arr) => {
            const dur = (end - start) / arr.length;
            return {
              word,
              start: start + wi * dur,
              end: start + (wi + 1) * dur,
            };
          }),
      });
    }
  }

  return { ...transcript, segments: newSegments };
}

export const EditLyricsDialog = () => {
  const { mode, close } = useDialog();
  const containerRef = useRef<HTMLDivElement>(null);

  const lyricsDialog = isEditLyricsMode(mode) ? mode : null;
  const open = lyricsDialog !== null;

  const [lyricsText, setLyricsText] = useState("");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const lastHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lyricsDialog) return;
    const hash = lyricsDialog.song.file_hash;
    if (hash === lastHashRef.current) return;
    lastHashRef.current = hash;

    setLoading(true);
    loadTranscript(hash)
      .then((t) => {
        setTranscript(t);
        setLyricsText(segmentsToText(t.segments));
      })
      .catch((err) => {
        toast.error(`Failed to load transcript: ${err}`);
        setTranscript(null);
        setLyricsText("");
      })
      .finally(() => setLoading(false));
  }, [lyricsDialog]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      lastHashRef.current = null;
    }
  }, [open]);

  const { focusedIndex } = useDialogNav({
    open,
    itemCount: 3, // textarea + save + cancel
    onBack: close,
    containerRef,
  });

  if (!lyricsDialog) {
    return null;
  }

  const { song } = lyricsDialog;

  const handleSave = async () => {
    if (!transcript) return;
    setSaving(true);
    try {
      const updated = applyTextToTranscript(transcript, lyricsText);
      await saveTranscript(song.file_hash, updated);
      toast.success("Lyrics saved");
      close();
    } catch (error) {
      toast.error(`Failed to save lyrics: ${error instanceof Error ? error.message : error}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <div ref={containerRef} className="contents">
          <DialogHeader>
            <DialogTitle>Edit Lyrics</DialogTitle>
            <DialogDescription>
              {song.title} — {song.artist}
              {song.transcript_source === "Lyrics" ? " (from lyrics)" : " (generated)"}
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Loading lyrics…
            </div>
          ) : (
            <Textarea
              value={lyricsText}
              onChange={(e) => setLyricsText(e.target.value)}
              placeholder="No lyrics available"
              className={cn(
                "min-h-[200px] max-h-[50vh] font-mono text-xs resize-y",
                focusedIndex === 0 && "ring-2 ring-primary",
              )}
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={close}
              className={cn(
                "focus-visible:ring-0 focus-visible:border-transparent",
                focusedIndex === 2 && "ring-2 ring-primary",
              )}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || loading || !transcript}
              className={cn(
                "focus-visible:ring-0 focus-visible:border-transparent",
                focusedIndex === 1 && "ring-2 ring-primary",
              )}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
