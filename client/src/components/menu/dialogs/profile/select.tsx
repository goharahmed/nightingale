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
import { useProfileMutations } from '@/mutations/use-profile-mutations';
import { useProfiles } from '@/queries/use-profiles';
import { useState } from 'react';

export const SelectProfileDialog = () => {
  const { data } = useProfiles();
  const currentProfile = useCurrentProfile();
  const { mode, close, setMode } = useDialog();
  const { mutateAsync } = useProfileMutations();

  const [newProfile, setNewProfile] = useState(currentProfile);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

  const profiles = data?.profiles ?? [];

  return (
    <Dialog open={mode === 'select-profile'} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
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
              <SelectTrigger id="model-1">
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
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="outline" onClick={() => setMode('create-profile')}>
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
          >
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
