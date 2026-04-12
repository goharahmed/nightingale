import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogMode, useDialog } from "@/hooks/use-dialog";
import { setSongThumbnail } from "@/tauri-bridge/youtube";
import { SONGS } from "@/queries/keys";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Song } from "@/types/Song";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";

export function isSetThumbnailMode(
  mode: DialogMode,
): mode is { mode: "set-thumbnail"; song: Song } {
  return (
    mode !== null && typeof mode === "object" && "mode" in mode && mode.mode === "set-thumbnail"
  );
}

export const SetThumbnailDialog = () => {
  const { mode, close } = useDialog();
  const queryClient = useQueryClient();

  const thumbnailDialog = isSetThumbnailMode(mode) ? mode : null;
  const open = thumbnailDialog !== null;

  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset state when dialog opens with a new song
  const lastHashRef = useRef<string | null>(null);
  if (thumbnailDialog && thumbnailDialog.song.file_hash !== lastHashRef.current) {
    lastHashRef.current = thumbnailDialog.song.file_hash;
    setSource("");
  }

  if (!thumbnailDialog) {
    return null;
  }

  const { song } = thumbnailDialog;

  const handleBrowse = async () => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif"],
          },
        ],
      });

      if (selected) {
        setSource(selected as string);
      }
    } catch (error) {
      console.error("File dialog error:", error);
    }
  };

  const handleSave = async () => {
    const trimmed = source.trim();
    if (!trimmed) {
      toast.error("Please provide a URL or select a local image file");
      return;
    }

    setSaving(true);
    try {
      await setSongThumbnail(song.file_hash, trimmed);
      queryClient.invalidateQueries({ queryKey: SONGS });
      toast.success("Thumbnail updated");
      close();
    } catch (error) {
      toast.error(`Failed to set thumbnail: ${error instanceof Error ? error.message : error}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Thumbnail</DialogTitle>
          <DialogDescription>
            Provide a YouTube URL, image URL, or browse for a local image file to use as the
            thumbnail for &ldquo;{song.title}&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label htmlFor="thumbnail-source">URL or file path</Label>
            <div className="flex gap-2">
              <Input
                id="thumbnail-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="https://youtube.com/watch?v=... or image URL"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSave();
                  }
                }}
              />
              <Button variant="outline" onClick={handleBrowse} type="button">
                Browse
              </Button>
            </div>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !source.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
