import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentProfile } from '@/hooks/use-current-profile';
import { useDialog } from '@/hooks/use-dialog';
import { useDialogNav } from '@/hooks/navigation/use-dialog-nav';
import { useProfileMutations } from '@/mutations/use-profile-mutations';
import { useProfiles } from '@/queries/use-profiles';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export const SelectProfileDialog = () => {
  const { data } = useProfiles();
  const currentProfile = useCurrentProfile();
  const { mode, close, setMode } = useDialog();
  const open = mode === 'select-profile';
  const { mutateAsync } = useProfileMutations();

  const [newProfile, setNewProfile] = useState(currentProfile);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

  const profiles = data?.profiles ?? [];

  const containerRef = useRef<HTMLDivElement>(null);
  const { focusedIndex } = useDialogNav({
    open,
    itemCount: 5,
    onBack: close,
    containerRef,
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <div ref={containerRef} className="contents">
          <DialogHeader>
            <DialogTitle>Select Profile</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="model-1">Profile</Label>
              <Select
                onValueChange={(profile) => setNewProfile(profile)}
                defaultValue={currentProfile}
              >
                <SelectTrigger
                  id="model-1"
                  className={cn(
                    'focus-visible:ring-0 focus-visible:border-transparent',
                    focusedIndex === 0 && 'ring-2 ring-primary',
                  )}
                >
                  <SelectValue placeholder="Select a profile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Profile</SelectLabel>
                    {profiles.map((profile) => (
                      <SelectItem value={profile}>{profile}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                onClick={close}
                className={cn(
                  'focus-visible:ring-0 focus-visible:border-transparent',
                  focusedIndex === 1 && 'ring-2 ring-primary',
                )}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="outline"
              onClick={() => setMode('create-profile')}
              className={cn(
                'focus-visible:ring-0 focus-visible:border-transparent',
                focusedIndex === 2 && 'ring-2 ring-primary',
              )}
            >
              Create New
            </Button>
            <Popover
              open={deleteConfirmationOpen}
              onOpenChange={setDeleteConfirmationOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="destructive"
                  onClick={() =>
                    setDeleteConfirmationOpen(!deleteConfirmationOpen)
                  }
                  className={cn(
                    'focus-visible:ring-0 focus-visible:border-transparent',
                    focusedIndex === 3 && 'ring-2 ring-primary',
                  )}
                >
                  Delete
                </Button>
              </PopoverTrigger>

              <PopoverContent side="bottom" align="start" className="w-48">
                <p className="text-sm">Are you sure?</p>

                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteConfirmationOpen(false)}
                  >
                    No
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!newProfile) {
                        return setDeleteConfirmationOpen(false);
                      }

                      await mutateAsync({ name: newProfile, type: 'delete' });
                      setDeleteConfirmationOpen(false);
                      close();
                    }}
                  >
                    Yes
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              disabled={newProfile === currentProfile}
              onClick={async () => {
                if (!newProfile) {
                  return close();
                }

                await mutateAsync({ name: newProfile, type: 'switch' });
                close();
              }}
              className={cn(
                'focus-visible:ring-0 focus-visible:border-transparent',
                focusedIndex === 4 && 'ring-2 ring-primary',
              )}
            >
              Select
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
