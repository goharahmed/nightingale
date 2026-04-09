/**
 * Audio Device Selector - POC Component
 * Allows selecting different output devices for vocals and instrumental during playback.
 * Supports both device-level routing (Web Audio) and channel-level routing (cpal/Rust).
 */

import { useAudioDevices } from "@/hooks/use-audio-devices";
import type { AudioPlayer } from "@/hooks/use-audio-player";
import {
  getAudioOutputDevices,
  formatChannelPair,
  getAvailableChannelPairs,
  type AudioOutputDevice,
  type MultiChannelConfig,
} from "@/tauri-bridge/multi-channel-audio";
import { useEffect, useState } from "react";

interface AudioDeviceSelectorProps {
  audioPlayer: AudioPlayer | null;
  onChannelRoutingChange?: (config: MultiChannelConfig | null) => void;
}

export function AudioDeviceSelector({
  audioPlayer,
  onChannelRoutingChange,
}: AudioDeviceSelectorProps) {
  const { devices, isLoading, error } = useAudioDevices();
  const [multiChannelDevices, setMultiChannelDevices] = useState<AudioOutputDevice[]>([]);
  const [vocalsDeviceId, setVocalsDeviceId] = useState<string>("");
  const [instrumentalDeviceId, setInstrumentalDeviceId] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [showChannelRouting, setShowChannelRouting] = useState(false);
  const [enableChannelRouting, setEnableChannelRouting] = useState(false);

  // Channel routing state
  const [vocalsDeviceName, setVocalsDeviceName] = useState<string>("");
  const [vocalsChannelPair, setVocalsChannelPair] = useState<number>(0);
  const [instrumentalDeviceName, setInstrumentalDeviceName] = useState<string>("");
  const [instrumentalChannelPair, setInstrumentalChannelPair] = useState<number>(2);

  // Load multi-channel devices from Rust/cpal
  useEffect(() => {
    getAudioOutputDevices()
      .then((devices) => {
        setMultiChannelDevices(devices);
        // Auto-enable channel routing if we have multi-channel devices
        const hasMultiChannel = devices.some((d) => d.maxChannels > 2);
        setShowChannelRouting(hasMultiChannel);

        // Set default device to first multi-channel device
        const defaultDevice = devices.find((d) => d.maxChannels > 2) || devices[0];
        if (defaultDevice) {
          setVocalsDeviceName(defaultDevice.name);
          setInstrumentalDeviceName(defaultDevice.name);
        }
      })
      .catch((err) => console.error("Failed to load audio devices:", err));
  }, []);

  // Notify parent when channel routing config changes
  useEffect(() => {
    if (!enableChannelRouting || !onChannelRoutingChange) {
      onChannelRoutingChange?.(null);
      return;
    }

    const config: MultiChannelConfig = {
      vocalsRouting: {
        deviceName: vocalsDeviceName,
        startChannel: vocalsChannelPair,
      },
      instrumentalRouting: {
        deviceName: instrumentalDeviceName,
        startChannel: instrumentalChannelPair,
      },
    };

    onChannelRoutingChange(config);
  }, [
    enableChannelRouting,
    vocalsDeviceName,
    vocalsChannelPair,
    instrumentalDeviceName,
    instrumentalChannelPair,
    onChannelRoutingChange,
  ]);

  const handleVocalsDeviceChange = async (deviceId: string) => {
    setVocalsDeviceId(deviceId);
    if (audioPlayer) {
      try {
        await audioPlayer.setVocalsOutputDevice(deviceId);
        setStatusMessage(
          `Vocals → ${devices.find((d) => d.deviceId === deviceId)?.label || "Device"}`,
        );
      } catch (err) {
        setStatusMessage(`Failed to set vocals device: ${err}`);
      }
    }
  };

  const handleInstrumentalDeviceChange = async (deviceId: string) => {
    setInstrumentalDeviceId(deviceId);
    if (audioPlayer) {
      try {
        await audioPlayer.setInstrumentalOutputDevice(deviceId);
        setStatusMessage(
          `Instrumental → ${devices.find((d) => d.deviceId === deviceId)?.label || "Device"}`,
        );
      } catch (err) {
        setStatusMessage(`Failed to set instrumental device: ${err}`);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="fixed bottom-20 left-4 bg-black/80 text-white p-4 rounded-lg text-sm">
        Loading audio devices...
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed bottom-20 left-4 bg-red-900/80 text-white p-4 rounded-lg text-sm">
        Error: {error}
      </div>
    );
  }

  if (!audioPlayer) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 bg-black/90 text-white p-4 rounded-lg text-sm space-y-3 max-w-md z-50">
      <div className="font-bold text-base mb-2">🎵 Audio Output Routing (POC)</div>

      <div className="space-y-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-400">Vocals Output:</span>
          <select
            className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
            value={vocalsDeviceId}
            onChange={(e) => handleVocalsDeviceChange(e.target.value)}
          >
            <option value="">Default</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-400">
            Instrumental Output:
          </span>
          <select
            className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
            value={instrumentalDeviceId}
            onChange={(e) => handleInstrumentalDeviceChange(e.target.value)}
          >
            <option value="">Default</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {statusMessage && (
        <div className="text-xs text-green-400 mt-2 border-t border-gray-700 pt-2">
          {statusMessage}
        </div>
      )}

      {showChannelRouting && multiChannelDevices.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-gray-700 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-400">
              🎛️ Channel-Specific Routing:
            </span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableChannelRouting}
                onChange={(e) => setEnableChannelRouting(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-gray-300">Enable</span>
            </label>
          </div>

          {enableChannelRouting && (
            <>
              <label className="block">
                <span className="text-xs uppercase tracking-wide text-gray-400">
                  Vocals Device:
                </span>
                <select
                  className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
                  value={vocalsDeviceName}
                  onChange={(e) => setVocalsDeviceName(e.target.value)}
                >
                  {multiChannelDevices.map((device) => (
                    <option key={device.name} value={device.name}>
                      {device.name} ({device.maxChannels} ch)
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-wide text-gray-400">
                  Vocals Channels:
                </span>
                <select
                  className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
                  value={vocalsChannelPair}
                  onChange={(e) => setVocalsChannelPair(Number(e.target.value))}
                >
                  {multiChannelDevices.find((d) => d.name === vocalsDeviceName)?.maxChannels &&
                    getAvailableChannelPairs(
                      multiChannelDevices.find((d) => d.name === vocalsDeviceName)!.maxChannels,
                    ).map((pair) => (
                      <option key={pair} value={pair}>
                        {formatChannelPair(pair)}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-wide text-gray-400">
                  Instrumental Device:
                </span>
                <select
                  className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
                  value={instrumentalDeviceName}
                  onChange={(e) => setInstrumentalDeviceName(e.target.value)}
                >
                  {multiChannelDevices.map((device) => (
                    <option key={device.name} value={device.name}>
                      {device.name} ({device.maxChannels} ch)
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-wide text-gray-400">
                  Instrumental Channels:
                </span>
                <select
                  className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
                  value={instrumentalChannelPair}
                  onChange={(e) => setInstrumentalChannelPair(Number(e.target.value))}
                >
                  {multiChannelDevices.find((d) => d.name === instrumentalDeviceName)
                    ?.maxChannels &&
                    getAvailableChannelPairs(
                      multiChannelDevices.find((d) => d.name === instrumentalDeviceName)!
                        .maxChannels,
                    ).map((pair) => (
                      <option key={pair} value={pair}>
                        {formatChannelPair(pair)}
                      </option>
                    ))}
                </select>
              </label>

              <div className="text-xs text-green-400 mt-2">
                ✅ Channel routing configured: Vocals → {vocalsDeviceName}{" "}
                {formatChannelPair(vocalsChannelPair)}, Instrumental → {instrumentalDeviceName}{" "}
                {formatChannelPair(instrumentalChannelPair)}
              </div>
            </>
          )}
        </div>
      )}

      {showChannelRouting && multiChannelDevices.length > 0 && (
        <div className="text-xs text-blue-400 mt-2 border-t border-gray-700 pt-2">
          <div className="font-semibold mb-1">📋 Available Devices:</div>
          {multiChannelDevices.map((device) => (
            <div key={device.name} className="ml-2">
              • {device.name}: {device.maxChannels} channels
              <div className="text-gray-500 ml-3">
                Available:{" "}
                {getAvailableChannelPairs(device.maxChannels)
                  .map((ch) => formatChannelPair(ch))
                  .join(", ")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500 mt-2 border-t border-gray-700 pt-2">
        💡 Use channel routing above for multi-channel interfaces, or device routing for separate
        outputs
      </div>
    </div>
  );
}
