import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import { useDialogNav } from "@/hooks/navigation/use-dialog-nav";
import { setFullScreen, isFullScreen as tauriIsFullScreen } from "@/tauri-bridge/fullScreen";
import { useDialog } from "@/hooks/use-dialog";
import { useConfig } from "@/queries/use-config";
import { useConfigMutation } from "@/mutations/use-config-mutation";
import { useMicDevices } from "@/hooks/use-mic-pitch";
import { cn } from "@/lib/utils";
import {
  getAudioOutputDevices,
  formatChannelPair,
  getAvailableChannelPairs,
  type AudioOutputDevice,
} from "@/tauri-bridge/multi-channel-audio";

const SEPARATORS = [
  { value: "karaoke", label: "UVR Karaoke" },
  { value: "demucs", label: "Demucs" },
];

const MODELS = ["large-v3", "large-v3-turbo", "medium", "small", "base", "tiny"];

const DEFAULT_MODEL: (typeof MODELS)[number] = "large-v3";
const DEFAULT_SEPARATOR = "karaoke";

const DEFAULT_BEAM_BATCH_SIZE = 8;

const SETTINGS_STOPS = [2, 1, 1, 1, 16, 16, 2];

const RING = "ring-2 ring-primary";
const NO_FOCUS_RING = "focus-visible:ring-0 focus-visible:border-transparent";

export const SettingsDialog = () => {
  const micDevices = useMicDevices();
  const { mode, close } = useDialog();
  const { data: config } = useConfig();
  const { mutate } = useConfigMutation();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean | null | undefined>(config?.fullscreen);
  const [multiChannelDevices, setMultiChannelDevices] = useState<AudioOutputDevice[]>([]);

  const open = mode === "settings";

  const { isFocused } = useDialogNav({
    open,
    itemCount: 39,
    stops: SETTINGS_STOPS,
    onBack: close,
    containerRef,
  });

  useEffect(() => {
    const updateIsFullScreen = async () => {
      setIsFullScreen(await tauriIsFullScreen());
    };

    updateIsFullScreen();
  }, []);

  // Load multi-channel audio devices
  useEffect(() => {
    getAudioOutputDevices()
      .then((devices) => setMultiChannelDevices(devices))
      .catch((err) => console.error("Failed to load audio devices:", err));
  }, []);

  const toggleWindowMode = (fullscreen: boolean) => {
    setIsFullScreen(fullscreen);
    setFullScreen(fullscreen);
    mutate({ fullscreen });
  };

  const generateRingClassName = (segment: number, slot?: number) => {
    return cn(NO_FOCUS_RING, isFocused(segment, slot) && RING);
  };

  const generateNumberSelect = (settingName: "beam_size" | "batch_size", value: number) => {
    return Array.from({ length: 16 })
      .fill(null)
      .map((_, idx) => {
        const idxToRender = idx + 1;

        return (
          <Button
            onClick={() => mutate({ [settingName]: idxToRender })}
            variant={value === idxToRender ? "default" : "outline"}
            className={generateRingClassName(settingName === "beam_size" ? 4 : 5, idx)}
          >
            {idx + 1}
          </Button>
        );
      });
  };

  const batchSize = config?.batch_size ?? DEFAULT_BEAM_BATCH_SIZE;
  const beamSize = config?.beam_size ?? DEFAULT_BEAM_BATCH_SIZE;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div ref={containerRef} className="contents">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              You can modify the preferred model to use for the stem separation and transcript and
              tweak model parameters
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label>Window</Label>
              <ButtonGroup>
                <Button
                  variant={isFullScreen === true ? "outline" : "default"}
                  onClick={() => toggleWindowMode(false)}
                  className={generateRingClassName(0, 0)}
                >
                  Windowed
                </Button>
                <Button
                  variant={isFullScreen === false ? "outline" : "default"}
                  onClick={() => toggleWindowMode(true)}
                  className={generateRingClassName(0, 1)}
                >
                  Fullscreen
                </Button>
              </ButtonGroup>
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field>
              <Label>Microphone</Label>
              <FieldDescription>Select which microphone to use for pitch scoring</FieldDescription>
              <Select
                onValueChange={(value) =>
                  mutate({
                    preferred_mic: value === "__default__" ? null : value,
                  })
                }
                value={config?.preferred_mic ?? "__default__"}
              >
                <SelectTrigger className={generateRingClassName(1)}>
                  <SelectValue placeholder="Default microphone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Microphone</SelectLabel>
                    <SelectItem value="__default__">Default</SelectItem>
                    {micDevices.map(({ deviceId, label }) => (
                      <SelectItem key={deviceId} value={deviceId}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <Label>Multi-Channel Audio Routing</Label>
              <FieldDescription>
                Route vocals and instrumental to specific output channels on your audio interface
              </FieldDescription>
              <ButtonGroup>
                <Button
                  variant={config?.enable_channel_routing ? "outline" : "default"}
                  onClick={() => mutate({ enable_channel_routing: false })}
                >
                  Disabled
                </Button>
                <Button
                  variant={config?.enable_channel_routing ? "default" : "outline"}
                  onClick={() => mutate({ enable_channel_routing: true })}
                >
                  Enabled
                </Button>
              </ButtonGroup>
            </Field>
            {config?.enable_channel_routing && multiChannelDevices.length > 0 && (
              <>
                <Field>
                  <Label>Vocals Output Device</Label>
                  <Select
                    onValueChange={(value) => mutate({ vocals_device_name: value })}
                    value={config?.vocals_device_name ?? multiChannelDevices[0]?.name}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select device" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Device</SelectLabel>
                        {multiChannelDevices.map((device) => (
                          <SelectItem key={device.name} value={device.name}>
                            {device.name} ({device.maxChannels} ch)
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <Label>Vocals Channels</Label>
                  <Select
                    onValueChange={(value) => mutate({ vocals_start_channel: Number(value) })}
                    value={String(config?.vocals_start_channel ?? 0)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select channels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Channel Pair</SelectLabel>
                        {multiChannelDevices.find(
                          (d) =>
                            d.name === (config?.vocals_device_name ?? multiChannelDevices[0]?.name),
                        )?.maxChannels &&
                          getAvailableChannelPairs(
                            multiChannelDevices.find(
                              (d) =>
                                d.name ===
                                (config?.vocals_device_name ?? multiChannelDevices[0]?.name),
                            )!.maxChannels,
                          ).map((pair) => (
                            <SelectItem key={pair} value={String(pair)}>
                              {formatChannelPair(pair)}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <Label>Instrumental Output Device</Label>
                  <Select
                    onValueChange={(value) => mutate({ instrumental_device_name: value })}
                    value={config?.instrumental_device_name ?? multiChannelDevices[0]?.name}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select device" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Device</SelectLabel>
                        {multiChannelDevices.map((device) => (
                          <SelectItem key={device.name} value={device.name}>
                            {device.name} ({device.maxChannels} ch)
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <Label>Instrumental Channels</Label>
                  <Select
                    onValueChange={(value) => mutate({ instrumental_start_channel: Number(value) })}
                    value={String(config?.instrumental_start_channel ?? 2)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select channels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Channel Pair</SelectLabel>
                        {multiChannelDevices.find(
                          (d) =>
                            d.name ===
                            (config?.instrumental_device_name ?? multiChannelDevices[0]?.name),
                        )?.maxChannels &&
                          getAvailableChannelPairs(
                            multiChannelDevices.find(
                              (d) =>
                                d.name ===
                                (config?.instrumental_device_name ?? multiChannelDevices[0]?.name),
                            )!.maxChannels,
                          ).map((pair) => (
                            <SelectItem key={pair} value={String(pair)}>
                              {formatChannelPair(pair)}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}
            <Field>
              <Label htmlFor="model-1">Separator</Label>
              <FieldDescription>
                Karaoke removes backing vocals for cleaner lyrics; Demucs is faster
              </FieldDescription>
              <Select
                onValueChange={(value) => mutate({ separator: value })}
                value={config?.separator ?? DEFAULT_SEPARATOR}
              >
                <SelectTrigger id="separator-1" className={generateRingClassName(2)}>
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
                value={config?.whisper_model ?? DEFAULT_MODEL}
              >
                <SelectTrigger id="model-1" className={generateRingClassName(3)}>
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
              <ButtonGroup>{generateNumberSelect("beam_size", beamSize)}</ButtonGroup>
            </Field>
            <Field>
              <Label>Batch Size</Label>
              <FieldDescription>Higher values use more memory but process faster</FieldDescription>
              <ButtonGroup>{generateNumberSelect("batch_size", batchSize)}</ButtonGroup>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                mutate({
                  separator: DEFAULT_SEPARATOR,
                  whisper_model: DEFAULT_MODEL,
                  beam_size: DEFAULT_BEAM_BATCH_SIZE,
                  batch_size: DEFAULT_BEAM_BATCH_SIZE,
                })
              }
              className={generateRingClassName(6, 0)}
            >
              Restore Defaults
            </Button>
            <Button variant="outline" onClick={close} className={generateRingClassName(6, 1)}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
