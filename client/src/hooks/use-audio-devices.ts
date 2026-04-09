/**
 * Hook to enumerate and monitor available audio output devices.
 * Uses the MediaDevices API to get a list of audio outputs.
 */

import { useEffect, useState } from "react";

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  groupId: string;
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let tempStream: MediaStream | null = null;

    const loadDevices = async () => {
      try {
        // Request microphone permission to get device labels
        // This is required for enumerateDevices to return actual device names
        try {
          tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (permErr) {
          console.warn("Microphone permission denied, device labels may be generic:", permErr);
        }

        const deviceList = await navigator.mediaDevices.enumerateDevices();

        // Stop the temporary stream immediately
        if (tempStream) {
          tempStream.getTracks().forEach((track) => track.stop());
          tempStream = null;
        }

        const audioOutputs = deviceList
          .filter((device) => device.kind === "audiooutput")
          .map((device) => ({
            deviceId: device.deviceId,
            label: device.label || `Audio Output ${device.deviceId.slice(0, 8)}`,
            groupId: device.groupId,
          }));

        if (mounted) {
          setDevices(audioOutputs);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to enumerate devices");
          setIsLoading(false);
        }
      }
    };

    loadDevices();

    // Listen for device changes (connect/disconnect)
    const handleDeviceChange = () => {
      loadDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      mounted = false;
      if (tempStream) {
        tempStream.getTracks().forEach((track) => track.stop());
      }
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, []);

  return { devices, error, isLoading };
}
