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
import { useEffect, useState } from 'react';
import {
  setFullScreen,
  isFullScreen as tauriIsFullScreen,
} from '@/tauri-bridge/fullScreen';
import { useDialog } from '@/hooks/use-dialog';
import { useConfig } from '@/queries/use-config';
import { useConfigMutation } from '@/mutations/use-config-mutation';
import { useMicDevices } from '@/hooks/use-mic-pitch';

const SEPARATORS = [
  { value: 'karaoke', label: 'UVR Karaoke' },
  { value: 'demucs', label: 'Demucs' },
];

const MODELS = [
  'large-v3',
  'large-v3-turbo',
  'medium',
  'small',
  'base',
  'tiny',
];

const DEFAULT_MODEL: (typeof MODELS)[number] = 'large-v3';
const DEFAULT_SEPARATOR = 'karaoke';

const DEFAULT_BEAM_BATCH_SIZE = 8;

export const SettingsDialog = () => {
  const { mode, close } = useDialog();
  const { data: config } = useConfig();
  const { mutate } = useConfigMutation();

  const [isFullScreen, setIsFullScreen] = useState<boolean | null | undefined>(
    config?.fullscreen,
  );

  useEffect(() => {
    const updateIsFullScreen = async () => {
      setIsFullScreen(await tauriIsFullScreen());
    };

    updateIsFullScreen();
  }, []);

  const batchSize = config?.batch_size ?? DEFAULT_BEAM_BATCH_SIZE;
  const beamSize = config?.beam_size ?? DEFAULT_BEAM_BATCH_SIZE;
  const micDevices = useMicDevices();

  return (
    <Dialog open={mode === 'settings'} onOpenChange={close}>
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

                  mutate({ fullscreen: false });
                }}
              >
                Windowed
              </Button>
              <Button
                variant={isFullScreen === false ? 'outline' : 'default'}
                onClick={() => {
                  setIsFullScreen(true);
                  setFullScreen(true);

                  mutate({ fullscreen: true });
                }}
              >
                Fullscreen
              </Button>
            </ButtonGroup>
          </Field>
        </FieldGroup>
        <FieldGroup>
          <Field>
            <Label>Microphone</Label>
            <FieldDescription>
              Select which microphone to use for pitch scoring
            </FieldDescription>
            <Select
              onValueChange={(value) =>
                mutate({
                  preferred_mic: value === '__default__' ? null : value,
                })
              }
              defaultValue={config?.preferred_mic ?? '__default__'}
            >
              <SelectTrigger>
                <SelectValue placeholder="Default microphone" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Microphone</SelectLabel>
                  <SelectItem value="__default__">Default</SelectItem>
                  {micDevices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="model-1">Separator</Label>
            <FieldDescription>
              Karaoke removes backing vocals for cleaner lyrics; Demucs is
              faster
            </FieldDescription>
            <Select
              onValueChange={(value) => mutate({ separator: value })}
              defaultValue={config?.separator ?? DEFAULT_SEPARATOR}
            >
              <SelectTrigger id="separator-1">
                <SelectValue placeholder="Select a separator" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Separator</SelectLabel>
                  {SEPARATORS.map(({ value, label }) => (
                    <SelectItem value={value}>{label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="model-1">Model</Label>
            <FieldDescription>
              Smaller models are faster but produce worse results
            </FieldDescription>
            <Select
              onValueChange={(value) => mutate({ whisper_model: value })}
              defaultValue={config?.whisper_model ?? DEFAULT_MODEL}
            >
              <SelectTrigger id="model-1">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Model</SelectLabel>
                  {MODELS.map((model) => (
                    <SelectItem value={model}>{model}</SelectItem>
                  ))}
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
              {new Array(16).fill(null).map((_, idx) => {
                const beamSizeToRender = idx + 1;

                return (
                  <Button
                    onClick={() => mutate({ beam_size: beamSizeToRender })}
                    variant={
                      beamSize === beamSizeToRender ? 'default' : 'outline'
                    }
                  >
                    {idx + 1}
                  </Button>
                );
              })}
            </ButtonGroup>
          </Field>
          <Field>
            <Label>Batch Size</Label>
            <FieldDescription>
              Higher values use more memory but process faster
            </FieldDescription>
            <ButtonGroup>
              {new Array(16).fill(null).map((_, idx) => {
                const batchSizeToRender = idx + 1;

                return (
                  <Button
                    onClick={() => mutate({ batch_size: batchSizeToRender })}
                    variant={
                      batchSize === batchSizeToRender ? 'default' : 'outline'
                    }
                  >
                    {idx + 1}
                  </Button>
                );
              })}
            </ButtonGroup>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
