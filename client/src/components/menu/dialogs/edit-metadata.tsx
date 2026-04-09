import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogMode, useDialog } from "@/hooks/use-dialog";
import { useDialogNav } from "@/hooks/navigation/use-dialog-nav";
import { updateSongMetadata } from "@/tauri-bridge/songs";
import { MENU, SONGS, SONGS_META } from "@/queries/keys";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Song } from "@/types/Song";

export function isEditMetadataMode(
  mode: DialogMode,
): mode is { mode: "edit-metadata"; song: Song } {
  return (
    mode !== null && typeof mode === "object" && "mode" in mode && mode.mode === "edit-metadata"
  );
}

export const EditMetadataDialog = () => {
  const { mode, close } = useDialog();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const metadataDialog = isEditMetadataMode(mode) ? mode : null;
  const open = metadataDialog !== null;

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync local state when dialog opens with a new song
  const lastHashRef = useRef<string | null>(null);
  if (metadataDialog && metadataDialog.song.file_hash !== lastHashRef.current) {
    lastHashRef.current = metadataDialog.song.file_hash;
    setTitle(metadataDialog.song.title);
    setArtist(metadataDialog.song.artist);
    setAlbum(metadataDialog.song.album);
  }

  const { focusedIndex } = useDialogNav({
    open,
    itemCount: 5, // 3 fields + save + cancel
    onBack: close,
    containerRef,
  });

  if (!metadataDialog) {
    return null;
  }

  const { song } = metadataDialog;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedTitle = title.trim() !== song.title ? title.trim() : undefined;
      const updatedArtist = artist.trim() !== song.artist ? artist.trim() : undefined;
      const updatedAlbum = album.trim() !== song.album ? album.trim() : undefined;

      if (!updatedTitle && !updatedArtist && !updatedAlbum) {
        close();
        return;
      }

      await updateSongMetadata(song.file_hash, updatedTitle, updatedArtist, updatedAlbum);
      queryClient.invalidateQueries({ queryKey: SONGS });
      queryClient.invalidateQueries({ queryKey: SONGS_META });
      queryClient.invalidateQueries({ queryKey: MENU });
      toast.success("Song metadata updated");
      close();
    } catch (error) {
      toast.error(`Failed to update metadata: ${error instanceof Error ? error.message : error}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <div ref={containerRef} className="contents">
          <DialogHeader>
            <DialogTitle>Edit Song Metadata</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Song title"
                className={cn(focusedIndex === 0 && "ring-2 ring-primary")}
              />
            </Field>
            <Field>
              <Label htmlFor="edit-artist">Artist</Label>
              <Input
                id="edit-artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Artist name"
                className={cn(focusedIndex === 1 && "ring-2 ring-primary")}
              />
            </Field>
            <Field>
              <Label htmlFor="edit-album">Album</Label>
              <Input
                id="edit-album"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Album name"
                className={cn(focusedIndex === 2 && "ring-2 ring-primary")}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={close}
              className={cn(
                "focus-visible:ring-0 focus-visible:border-transparent",
                focusedIndex === 4 && "ring-2 ring-primary",
              )}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "focus-visible:ring-0 focus-visible:border-transparent",
                focusedIndex === 3 && "ring-2 ring-primary",
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
