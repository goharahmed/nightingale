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
import { useProfileDialog } from '@/hooks/use-profile-dialog';

export const CreateProfileDialog = () => {
  const { mode, setMode } = useProfileDialog();

  return (
    <Dialog
      open={mode === 'create'}
      onOpenChange={(open) => {
        if (open) {
          return setMode('create');
        }

        setMode(null);
      }}
    >
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
            <Input id="name-1" name="name" />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" onClick={() => setMode(null)}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
