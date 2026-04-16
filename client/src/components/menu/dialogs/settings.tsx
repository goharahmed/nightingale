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
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { useDialogNav } from "@/hooks/navigation/use-dialog-nav";
import { setFullScreen, isFullScreen as tauriIsFullScreen } from "@/tauri-bridge/fullScreen";
import { setOpenaiApiKey } from "@/tauri-bridge/config";
import { useDialog } from "@/hooks/use-dialog";
import { useConfig } from "@/queries/use-config";
import { CONFIG } from "@/queries/keys";
import { useQueryClient } from "@tanstack/react-query";
import { useConfigMutation } from "@/mutations/use-config-mutation";
import { toast } from "sonner";
import { useMicDevices } from "@/hooks/use-mic-pitch";
import { useInputDevices } from "@/hooks/use-multi-mic";
import { useMicTest } from "@/hooks/use-mic-test";
import { LevelMeter } from "@/components/shared/level-meter";
import { cn } from "@/lib/utils";
import {
  getAudioOutputDevices,
  formatChannelPair,
  getAvailableChannelPairs,
  type AudioOutputDevice,
} from "@/tauri-bridge/multi-channel-audio";
import { formatInputChannel, getAvailableInputChannels } from "@/tauri-bridge/multi-mic";
import type { MicSlotSetting } from "@/types/MicSlotSetting";
import { MetadataFixDialog } from "./metadata-fix";

const SEPARATORS = [
  { value: "karaoke", label: "UVR Karaoke" },
  { value: "demucs", label: "Demucs" },
];

const MODELS = ["large-v3", "large-v3-turbo", "medium", "small", "base", "tiny"];

const DEFAULT_MODEL: (typeof MODELS)[number] = "large-v3";
const DEFAULT_SEPARATOR = "karaoke";

const DEFAULT_BEAM_BATCH_SIZE = 8;

const SETTINGS_STOPS = [2, 1, 1, 1, 16, 16, 1, 2];

const RING = "ring-2 ring-primary";
const NO_FOCUS_RING = "focus-visible:ring-0 focus-visible:border-transparent";

export const SettingsDialog = () => {
  const micDevices = useMicDevices();
  const { devices: inputDevices } = useInputDevices();
  const micTest = useMicTest();
  const { mode, close } = useDialog();
  const { data: config } = useConfig();
  const { mutate } = useConfigMutation();
  const queryClient = useQueryClient();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean | null | undefined>(config?.fullscreen);
  const [multiChannelDevices, setMultiChannelDevices] = useState<AudioOutputDevice[]>([]);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [metadataFixOpen, setMetadataFixOpen] = useState(false);

  const open = mode === "settings";

  // Stop mic test and clear sensitive draft when settings dialog closes
  useEffect(() => {
    if (!open) {
      if (micTest.testing) void micTest.stop();
      setApiKeyDraft("");
    }
  }, [open, micTest]);

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
                    preferred_mic_channel: null,
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
            {(() => {
              const selectedInputDev = inputDevices.find((d) => d.name === config?.preferred_mic);
              if (!selectedInputDev || selectedInputDev.max_channels <= 1) return null;
              return (
                <Field>
                  <Label>Input Channel</Label>
                  <FieldDescription>
                    Pick which physical input channel to capture from this device. "All (downmix)"
                    mixes every channel together — not recommended for multi-channel mixers.
                  </FieldDescription>
                  <Select
                    onValueChange={(value) =>
                      mutate({
                        preferred_mic_channel: value === "__mix__" ? null : Number(value),
                      })
                    }
                    value={
                      config?.preferred_mic_channel != null
                        ? String(config.preferred_mic_channel)
                        : "__mix__"
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All channels (downmix)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Input Channel</SelectLabel>
                        <SelectItem value="__mix__">All (downmix)</SelectItem>
                        {getAvailableInputChannels(selectedInputDev.max_channels).map((ch) => (
                          <SelectItem key={ch} value={String(ch)}>
                            {formatInputChannel(ch)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              );
            })()}
            <Field>
              <Label>Test Input</Label>
              <FieldDescription>
                Verify your microphone is working. The level bar should move when you speak or sing.
              </FieldDescription>
              <div className="flex items-center gap-3">
                <Button
                  variant={micTest.testing ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (micTest.testing) {
                      void micTest.stop();
                    } else {
                      void micTest.start(
                        config?.preferred_mic ?? null,
                        config?.preferred_mic_channel ?? null,
                      );
                    }
                  }}
                >
                  {micTest.testing ? "■ Stop" : "▶ Test Mic"}
                </Button>
                <div className="flex-1">
                  <LevelMeter level={micTest.rms} height="10px" showDb />
                </div>
              </div>
            </Field>
            <Field>
              <Label>Multi-Mic Input</Label>
              <FieldDescription>
                Enable multiple microphone inputs for multi-vocalist scoring. Select how many mic
                slots to use and configure each one with a specific device and input channel.
              </FieldDescription>
              <ButtonGroup>
                {[1, 2, 3, 4].map((n) => (
                  <Button
                    key={n}
                    variant={(config?.mic_slot_count ?? 1) === n ? "default" : "outline"}
                    onClick={() => {
                      const existing = config?.mic_slots ?? [];
                      const slots: MicSlotSetting[] = Array.from({ length: n }, (_, i) => ({
                        device_name: existing[i]?.device_name ?? null,
                        input_channel: existing[i]?.input_channel ?? null,
                        enabled: existing[i]?.enabled ?? true,
                      }));
                      mutate({ mic_slot_count: n, mic_slots: slots });
                    }}
                  >
                    {n} {n === 1 ? "mic" : "mics"}
                  </Button>
                ))}
              </ButtonGroup>
            </Field>
            {(config?.mic_slot_count ?? 1) > 1 &&
              Array.from({ length: config?.mic_slot_count ?? 1 }, (_, slotIdx) => {
                const slotSetting = config?.mic_slots?.[slotIdx];
                const selectedDevice = inputDevices.find(
                  (d) => d.name === slotSetting?.device_name,
                );
                return (
                  <div key={slotIdx} className="rounded-md border p-3 space-y-3">
                    <Label className="text-sm font-semibold">Mic Slot {slotIdx + 1}</Label>
                    <Field>
                      <Label>Input Device</Label>
                      <Select
                        onValueChange={(value) => {
                          const slots = [...(config?.mic_slots ?? [])];
                          while (slots.length <= slotIdx) {
                            slots.push({ device_name: null, input_channel: null, enabled: true });
                          }
                          slots[slotIdx] = {
                            ...slots[slotIdx],
                            device_name: value === "__default__" ? null : value,
                            input_channel: null,
                          };
                          mutate({ mic_slots: slots });
                        }}
                        value={slotSetting?.device_name ?? "__default__"}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Default input device" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Input Device</SelectLabel>
                            <SelectItem value="__default__">Default</SelectItem>
                            {inputDevices.map((dev) => (
                              <SelectItem key={dev.name} value={dev.name}>
                                {dev.name} ({dev.max_channels} ch)
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    {selectedDevice && selectedDevice.max_channels > 1 && (
                      <Field>
                        <Label>Input Channel</Label>
                        <FieldDescription>
                          Pick which physical input channel this vocalist is on
                        </FieldDescription>
                        <Select
                          onValueChange={(value) => {
                            const slots = [...(config?.mic_slots ?? [])];
                            while (slots.length <= slotIdx) {
                              slots.push({
                                device_name: null,
                                input_channel: null,
                                enabled: true,
                              });
                            }
                            slots[slotIdx] = {
                              ...slots[slotIdx],
                              input_channel: value === "__mix__" ? null : Number(value),
                            };
                            mutate({ mic_slots: slots });
                          }}
                          value={
                            slotSetting?.input_channel != null
                              ? String(slotSetting.input_channel)
                              : "__mix__"
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All channels (downmix)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Input Channel</SelectLabel>
                              <SelectItem value="__mix__">All (downmix)</SelectItem>
                              {getAvailableInputChannels(selectedDevice.max_channels).map((ch) => (
                                <SelectItem key={ch} value={String(ch)}>
                                  {formatInputChannel(ch)}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </div>
                );
              })}
            {(config?.mic_slot_count ?? 1) > 1 && (
              <>
                <Field>
                  <Label>Duet Mapping: Singer 1 Mic Slot</Label>
                  <FieldDescription>
                    Choose which mic slot should be scored against singer-1 during multi-singer mode.
                  </FieldDescription>
                  <Select
                    onValueChange={(value) =>
                      mutate({ singer_1_mic_slot: value === "__default__" ? null : Number(value) })
                    }
                    value={
                      config?.singer_1_mic_slot != null
                        ? String(config.singer_1_mic_slot)
                        : "__default__"
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auto (Slot 1)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Mic Slot</SelectLabel>
                        <SelectItem value="__default__">Auto (Slot 1)</SelectItem>
                        {Array.from({ length: config?.mic_slot_count ?? 1 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            Slot {i + 1}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <Label>Duet Mapping: Singer 2 Mic Slot</Label>
                  <FieldDescription>
                    Choose which mic slot should be scored against singer-2 during multi-singer mode.
                  </FieldDescription>
                  <Select
                    onValueChange={(value) =>
                      mutate({ singer_2_mic_slot: value === "__default__" ? null : Number(value) })
                    }
                    value={
                      config?.singer_2_mic_slot != null
                        ? String(config.singer_2_mic_slot)
                        : "__default__"
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auto (Slot 2)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Mic Slot</SelectLabel>
                        <SelectItem value="__default__">Auto (Slot 2)</SelectItem>
                        {Array.from({ length: config?.mic_slot_count ?? 1 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            Slot {i + 1}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}
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
                  onClick={() => {
                    // Enable with default values if not already set
                    const defaultDevice = multiChannelDevices[0]?.name ?? "";
                    mutate({
                      enable_channel_routing: true,
                      vocals_device_name: config?.vocals_device_name ?? defaultDevice,
                      vocals_start_channel: config?.vocals_start_channel ?? 0,
                      instrumental_device_name: config?.instrumental_device_name ?? defaultDevice,
                      instrumental_start_channel: config?.instrumental_start_channel ?? 2,
                    });
                  }}
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
            <Field>
              <Label htmlFor="openai-api-key">OpenAI API Key</Label>
              <FieldDescription>
                Enables high-quality romanised lyrics for Urdu, Hindi, Arabic and other non-Latin
                scripts. Leave blank to use basic transliteration.
                {config?.openai_api_key && (
                  <span className="ml-1 text-green-500">✓ Key saved ({config.openai_api_key})</span>
                )}
              </FieldDescription>
              <div className="flex gap-2">
                <Input
                  id="openai-api-key"
                  type="password"
                  placeholder={config?.openai_api_key ? "Enter new key to replace" : "sk-..."}
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  className={cn("font-mono flex-1", generateRingClassName(6))}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!apiKeyDraft.trim()}
                  onClick={async () => {
                    await setOpenaiApiKey(apiKeyDraft.trim());
                    setApiKeyDraft("");
                    // Refresh config to show updated masked key
                    queryClient.invalidateQueries({ queryKey: CONFIG });
                    toast.success("API key saved");
                  }}
                >
                  Save
                </Button>
                {config?.openai_api_key && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await setOpenaiApiKey(null);
                      setApiKeyDraft("");
                      queryClient.invalidateQueries({ queryKey: CONFIG });
                      toast.success("API key removed");
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </Field>
            <Field>
              <Label>AI Metadata Fixer</Label>
              <FieldDescription>
                Uses your OpenAI key to identify correct song titles, artists, and albums from
                filenames. Review and approve suggestions one by one before any changes are made.
              </FieldDescription>
              <Button
                variant="outline"
                size="sm"
                disabled={!config?.openai_api_key}
                onClick={() => setMetadataFixOpen(true)}
              >
                Fix Library Metadata…
              </Button>
              {!config?.openai_api_key && (
                <p className="text-xs text-muted-foreground mt-1">
                  Set an OpenAI API key above to enable this feature.
                </p>
              )}
            </Field>
          </FieldGroup>
          <MetadataFixDialog open={metadataFixOpen} onClose={() => setMetadataFixOpen(false)} />
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
              className={generateRingClassName(7, 0)}
            >
              Restore Defaults
            </Button>
            <Button variant="outline" onClick={close} className={generateRingClassName(7, 1)}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
