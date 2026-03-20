import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettingsDialog } from '@/hooks/use-settings-dialog';
import { useEffect, useState } from 'react';
import {
  setFullScreen,
  isFullScreen as tauriIsFullScreen,
} from '@/tauri-bridge/fullScreen';

export const SettingsDialog = () => {
  const [isFullScreen, setIsFullScreen] = useState<boolean | null>(null);
  const { open, setOpen } = useSettingsDialog();

  useEffect(() => {
    const updateIsFullScreen = async () => {
      setIsFullScreen(await tauriIsFullScreen());
    };

    updateIsFullScreen();
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            You can modify the preferred model to use for the stem separation
            and transcript and tweak model parameters
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label>Window</Label>
            <ButtonGroup>
              <Button
                variant={isFullScreen === true ? 'outline' : 'default'}
                onClick={() => {
                  setIsFullScreen(false);
                  setFullScreen(false);
                }}
              >
                Windowed
              </Button>
              <Button
                variant={isFullScreen === false ? 'outline' : 'default'}
                onClick={() => {
                  setIsFullScreen(true);
                  setFullScreen(true);
                }}
              >
                Fullscreen
              </Button>
            </ButtonGroup>
          </Field>
        </FieldGroup>
        <FieldGroup>
          <Field>
            <Label htmlFor="model-1">Separator</Label>
            <FieldDescription>
              Karaoke removes backing vocals for cleaner lyrics; Demucs is
              faster
            </FieldDescription>
            <Select>
              <SelectTrigger id="model-1">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Models</SelectLabel>
                  <SelectItem value="apple">Apple</SelectItem>
                  <SelectItem value="banana">Banana</SelectItem>
                  <SelectItem value="blueberry">Blueberry</SelectItem>
                  <SelectItem value="grapes">Grapes</SelectItem>
                  <SelectItem value="pineapple">Pineapple</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="model-1">Model</Label>
            <FieldDescription>
              Smaller models are faster but produce worse results
            </FieldDescription>
            <Select>
              <SelectTrigger id="model-1">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Models</SelectLabel>
                  <SelectItem value="apple">Apple</SelectItem>
                  <SelectItem value="banana">Banana</SelectItem>
                  <SelectItem value="blueberry">Blueberry</SelectItem>
                  <SelectItem value="grapes">Grapes</SelectItem>
                  <SelectItem value="pineapple">Pineapple</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label>Beam Size</Label>
            <FieldDescription>
              Higher values improve accuracy at the cost of speed
            </FieldDescription>
            <ButtonGroup>
              {new Array(16).fill(null).map((_, idx) => (
                <Button variant="outline">{idx + 1}</Button>
              ))}
            </ButtonGroup>
          </Field>
          <Field>
            <Label>Batch Size</Label>
            <FieldDescription>
              Higher values use more memory but process faster
            </FieldDescription>
            <ButtonGroup>
              {new Array(16).fill(null).map((_, idx) => (
                <Button variant="outline">{idx + 1}</Button>
              ))}
            </ButtonGroup>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
