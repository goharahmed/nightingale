import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDialog } from '@/hooks/use-dialog';
import { useProfileMutations } from '@/mutations/use-profile-mutations';
import { useState } from 'react';

export const CreateProfileDialog = () => {
  const { mode, close } = useDialog();
  const [name, setName] = useState<string | null>(null);
  const { mutateAsync } = useProfileMutations();

  return (
    <Dialog open={mode === 'create-profile'} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
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
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" onClick={close}>
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

              await mutateAsync({ name, type: 'create' });
              close();
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
