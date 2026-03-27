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
import { useProfileMutations } from "@/mutations/use-profile-mutations";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const CreateProfileDialog = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState<string | null>(null);

  const { mode, close } = useDialog();
  const { mutateAsync } = useProfileMutations();

  const open = mode === "create-profile";

  const { focusedIndex } = useDialogNav({
    open,
    itemCount: 2,
    onBack: close,
    containerRef,
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <div className="contents">
          <DialogHeader>
            <DialogTitle>Create Profile</DialogTitle>
            <DialogDescription>
              Just enter your profile name and you're ready to go
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="name-1">Name</Label>
              <Input
                id="name-1"
                name="name"
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
                  onClick={close}
                  className={cn(
                    "focus-visible:ring-0 focus-visible:border-transparent",
                    focusedIndex === 0 && "ring-2 ring-primary",
                  )}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                disabled={!name}
                type="submit"
                onClick={async () => {
                  if (!name) {
                    return close();
                  }

                  await mutateAsync({ name, type: "create" });
                  close();
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
        </div>
      </DialogContent>
    </Dialog>
  );
};
