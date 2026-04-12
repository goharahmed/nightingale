import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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
import { useDialogNav } from "@/hooks/navigation/use-dialog-nav";
import { useRenamePlaylist } from "@/queries/use-playlists";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function isRenamePlaylistMode(
  mode: DialogMode,
): mode is { mode: "rename-playlist"; playlistId: number; currentName: string } {
  return (
    mode !== null && typeof mode === "object" && "mode" in mode && mode.mode === "rename-playlist"
  );
}

export const RenamePlaylistDialog = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");

  const { mode, close } = useDialog();
  const { mutateAsync } = useRenamePlaylist();

  const renameMode = isRenamePlaylistMode(mode) ? mode : null;
  const open = renameMode !== null;

  useEffect(() => {
    if (renameMode) {
      setName(renameMode.currentName);
    }
  }, [renameMode]);

  const { focusedIndex } = useDialogNav({
    open,
    itemCount: 2,
    onBack: close,
    containerRef,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        setName("");
        close();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename Playlist</DialogTitle>
          <DialogDescription>Enter a new name for the playlist</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label htmlFor="rename-playlist-name">Name</Label>
            <Input
              id="rename-playlist-name"
              name="name"
              value={name}
              onChange={({ target: { value } }) => setName(value)}
              className={cn(
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent",
              )}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <div
            ref={containerRef}
            className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          >
            <DialogClose asChild>
              <Button
                variant="outline"
                onClick={() => {
                  setName("");
                  close();
                }}
                className={cn(
                  "focus-visible:ring-0 focus-visible:border-transparent",
                  focusedIndex === 0 && "ring-2 ring-primary",
                )}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={
                !name.trim() || (renameMode != null && name.trim() === renameMode.currentName)
              }
              type="submit"
              onClick={async () => {
                if (!renameMode) return;
                try {
                  await mutateAsync({ playlistId: renameMode.playlistId, name: name.trim() });
                  toast.success(`Renamed playlist to "${name.trim()}"`);
                  setName("");
                  close();
                } catch {
                  // Error handled by mutation hook
                }
              }}
              className={cn(
                "focus-visible:ring-0 focus-visible:border-transparent",
                focusedIndex === 1 && "ring-2 ring-primary",
              )}
            >
              Rename
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
