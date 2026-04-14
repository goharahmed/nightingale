import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { usePendingCorrections, useMetadataFixStatus } from "@/queries/use-metadata-corrections";
import {
  startMetadataFix,
  cancelMetadataFix,
  confirmCorrection,
  rejectCorrection,
  applyConfirmedToFiles,
} from "@/tauri-bridge/metadata-fix";
import { METADATA_CORRECTIONS, SONGS, SONGS_META, MENU } from "@/queries/keys";
import { toast } from "sonner";
import { useState } from "react";
import type { MetadataCorrection } from "@/types/MetadataCorrection";
import {
  CheckIcon,
  XIcon,
  ArrowRightIcon,
  FileIcon,
  Loader2Icon,
  SparklesIcon,
  SaveIcon,
  ImageIcon,
} from "lucide-react";

export const MetadataFixDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const { data: corrections = [] } = usePendingCorrections();
  const { data: status } = useMetadataFixStatus();
  const [processingId, setProcessingId] = useState<number | null>(null);

  const isRunning = status?.running ?? false;
  const progress =
    status && status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;

  const handleStart = async () => {
    try {
      await startMetadataFix();
      toast.success("Metadata fix started — scanning your library…");
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleCancel = async () => {
    await cancelMetadataFix();
    toast.info("Metadata fix cancelled");
  };

  const handleConfirm = async (correction: MetadataCorrection, writeToFile: boolean) => {
    setProcessingId(correction.id);
    try {
      await confirmCorrection(correction.id, writeToFile);
      queryClient.invalidateQueries({ queryKey: METADATA_CORRECTIONS });
      queryClient.invalidateQueries({ queryKey: SONGS });
      queryClient.invalidateQueries({ queryKey: SONGS_META });
      queryClient.invalidateQueries({ queryKey: MENU });
      toast.success(
        writeToFile
          ? `Updated "${correction.suggested_title}" — tags written to file`
          : `Updated "${correction.suggested_title}" — saved in library`,
      );
    } catch (e) {
      toast.error(`Failed: ${e}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (correction: MetadataCorrection) => {
    setProcessingId(correction.id);
    try {
      await rejectCorrection(correction.id);
      queryClient.invalidateQueries({ queryKey: METADATA_CORRECTIONS });
      toast.info(`Skipped "${correction.original_title}"`);
    } catch (e) {
      toast.error(`Failed: ${e}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApplyAllToFiles = async () => {
    try {
      const count = await applyConfirmedToFiles();
      queryClient.invalidateQueries({ queryKey: METADATA_CORRECTIONS });
      toast.success(`Wrote tags to ${count} file(s)`);
    } catch (e) {
      toast.error(`Failed: ${e}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-yellow-500" />
            AI Metadata Fixer
          </DialogTitle>
          <DialogDescription>
            Uses OpenAI to identify correct song titles, artists, and albums from filenames and
            partial metadata. Review suggestions below — nothing is changed until you confirm.
          </DialogDescription>
        </DialogHeader>

        {/* Progress section when running */}
        {isRunning && status && (
          <div className="space-y-2 px-1">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Processing {status.processed} / {status.total} songs…
              </span>
              {status.errors > 0 && (
                <span className="text-destructive">{status.errors} errors</span>
              )}
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Corrections list */}
        {corrections.length > 0 ? (
          <ScrollArea className="flex-1 min-h-0 max-h-[50vh] border rounded-md">
            <div className="divide-y">
              {corrections.map((c) => (
                <CorrectionCard
                  key={c.id}
                  correction={c}
                  processing={processingId === c.id}
                  onConfirm={(writeToFile) => handleConfirm(c, writeToFile)}
                  onReject={() => handleReject(c)}
                />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            {isRunning ? (
              <p className="text-sm">Waiting for AI suggestions…</p>
            ) : (
              <>
                <SparklesIcon className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No pending corrections.</p>
                <p className="text-xs mt-1">
                  Click "Scan Library" to find songs with bad metadata.
                </p>
              </>
            )}
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <div className="flex gap-2">
            {isRunning ? (
              <Button variant="destructive" size="sm" onClick={handleCancel}>
                Cancel Scan
              </Button>
            ) : (
              <Button size="sm" onClick={handleStart}>
                <SparklesIcon className="h-4 w-4 mr-1" />
                Scan Library
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {corrections.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleApplyAllToFiles}>
                <SaveIcon className="h-4 w-4 mr-1" />
                Write All Confirmed to Files
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Individual correction card ──────────────────────────────────────────

function CorrectionCard({
  correction: c,
  processing,
  onConfirm,
  onReject,
}: {
  correction: MetadataCorrection;
  processing: boolean;
  onConfirm: (writeToFile: boolean) => void;
  onReject: () => void;
}) {
  const filename = c.file_path.split("/").pop() ?? c.file_path;
  const [imgError, setImgError] = useState(false);

  return (
    <div className="p-3 space-y-2 text-sm hover:bg-accent/30 transition-colors">
      {/* Filename */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileIcon className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{filename}</span>
      </div>

      <div className="flex gap-3">
        {/* Album art thumbnail */}
        {c.suggested_album_art_url && !imgError ? (
          <div className="flex-shrink-0">
            <img
              src={c.suggested_album_art_url}
              alt={`${c.suggested_album} cover`}
              className="h-[72px] w-[72px] rounded-md object-cover border border-border shadow-sm"
              onError={() => setImgError(true)}
            />
          </div>
        ) : c.suggested_album_art_url && imgError ? (
          <div className="flex-shrink-0 h-[72px] w-[72px] rounded-md border border-dashed border-border flex items-center justify-center">
            <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
          </div>
        ) : null}

        {/* Comparison grid */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-1 items-center min-w-0 flex-1">
          {/* Title row */}
          <MetadataField label="Title" value={c.original_title} variant="old" />
          <ArrowRightIcon className="h-3 w-3 text-muted-foreground" />
          <MetadataField label="Title" value={c.suggested_title} variant="new" />

          {/* Artist row */}
          <MetadataField label="Artist" value={c.original_artist} variant="old" />
          <ArrowRightIcon className="h-3 w-3 text-muted-foreground" />
          <MetadataField label="Artist" value={c.suggested_artist} variant="new" />

          {/* Album row */}
          <MetadataField label="Album" value={c.original_album} variant="old" />
          <ArrowRightIcon className="h-3 w-3 text-muted-foreground" />
          <MetadataField label="Album" value={c.suggested_album} variant="new" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="default"
          size="sm"
          disabled={processing}
          onClick={() => onConfirm(false)}
          className="h-7 text-xs"
        >
          {processing ? (
            <Loader2Icon className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <CheckIcon className="h-3 w-3 mr-1" />
          )}
          Accept (DB only)
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={processing}
          onClick={() => onConfirm(true)}
          className="h-7 text-xs"
        >
          {processing ? (
            <Loader2Icon className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <SaveIcon className="h-3 w-3 mr-1" />
          )}
          Accept & Write to File
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={processing}
          onClick={onReject}
          className="h-7 text-xs text-destructive hover:text-destructive"
        >
          <XIcon className="h-3 w-3 mr-1" />
          Reject
        </Button>
      </div>
    </div>
  );
}

function MetadataField({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "old" | "new";
}) {
  return (
    <div className="min-w-0">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <p
        className={`truncate text-xs font-medium ${
          variant === "old" ? "text-muted-foreground line-through" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
