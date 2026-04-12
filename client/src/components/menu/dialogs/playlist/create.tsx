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
import { useDialog } from "@/hooks/use-dialog";
import { useDialogNav } from "@/hooks/navigation/use-dialog-nav";
import { useCreatePlaylist } from "@/queries/use-playlists";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const CreatePlaylistDialog = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");

  const { mode, close } = useDialog();
  const { mutateAsync } = useCreatePlaylist();

  const open = mode === "create-playlist";

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
          <DialogTitle>Create Playlist</DialogTitle>
          <DialogDescription>Enter a name for your new playlist</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label htmlFor="playlist-name">Name</Label>
            <Input
              id="playlist-name"
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
              disabled={!name.trim()}
              type="submit"
              onClick={async () => {
                try {
                  await mutateAsync(name.trim());
                  toast.success(`Created playlist "${name.trim()}"`);
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
              Create
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
