import { Song } from "@/types/Song";
import { Stepper } from "./stepper";
import { onShiftKeyDone, onShiftTempoDone, shiftKey, shiftTempo } from "@/tauri-bridge/analysis";
import { useEffect, useRef } from "react";
import { calculateKeyShift } from "@/utils/shift-key";

export type ShiftType = "tempo" | "key";

interface Props {
  song: Song;
  status: Record<ShiftType, boolean>;
  onStart: (shiftType: ShiftType) => void;
  onSuccess: (message: string, shiftType: ShiftType) => void;
  onError: (message: string, shiftType: ShiftType) => void;
}

export const Shifts = ({ song, status, onSuccess, onError, onStart }: Props) => {
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const withOnStart = (callback: () => void, shiftType: ShiftType) => () => {
    onStart(shiftType);

    try {
      callback();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      onErrorRef.current(`Error while shifting the tempo: ${message}`, shiftType);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let unlistenTempo: (() => void) | undefined;
    let unlistenKey: (() => void) | undefined;

    onShiftKeyDone(({ file_hash, error }) => {
      if (file_hash !== song.file_hash) {
        return;
      }

      if (!error) {
        onSuccessRef.current("Song key shifted successfully", "key");
      } else {
        onErrorRef.current(`Error while shifting the key: ${error}`, "key");
      }
    }).then((fn) => {
      if (cancelled) {
        fn();

        return;
      }

      unlistenKey = fn;
    });

    onShiftTempoDone(({ file_hash, error }) => {
      if (file_hash !== song.file_hash) {
        return;
      }

      if (!error) {
        onSuccessRef.current("Song tempo shifted successfully", "tempo");
      } else {
        onErrorRef.current(`Error while shifting the tempo: ${error}`, "tempo");
      }
    }).then((fn) => {
      if (cancelled) {
        fn();

        return;
      }

      unlistenTempo = fn;
    });

    return () => {
      cancelled = true;

      unlistenTempo?.();
      unlistenKey?.();
    };
  }, [song.file_hash]);

  if (!song.is_analyzed) {
    return null;
  }

  const loading = status.key || status.tempo;

  const onShiftKey = (direction: "up" | "down") => {
    if (!song.key) {
      return;
    }

    const { key, keyOffset, pitchRatio } = calculateKeyShift(
      song.key,
      song.key_offset + (direction === "up" ? 1 : -1),
    );

    shiftKey(song.file_hash, key, pitchRatio, keyOffset);
  };

  return (
    <div className="flex gap-1">
      <Stepper
        loading={status.tempo}
        label={song.tempo.toFixed(1)}
        tooltip="Click +/- to shift the song tempo"
        onClick={{
          plus: withOnStart(() => shiftTempo(song.file_hash, song.tempo + 0.1), "tempo"),
          minus: withOnStart(() => shiftTempo(song.file_hash, song.tempo - 0.1), "tempo"),
        }}
        disabled={{
          plus: loading,
          minus: loading,
        }}
      />
      <Stepper
        loading={status.key}
        label={song.override_key ?? song.key}
        tooltip={`Click +/- to shift the song key. ${song.key ? `Default key is ${song.key}` : "Reanalyze the song to identify the key"}`}
        onClick={{
          plus: withOnStart(() => onShiftKey("up"), "key"),
          minus: withOnStart(() => onShiftKey("down"), "key"),
        }}
        disabled={{
          plus: loading,
          minus: loading,
        }}
      />
    </div>
  );
};
