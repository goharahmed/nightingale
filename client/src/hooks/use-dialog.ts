import { Song } from "@/types/Song";
import { atom, useAtom } from "jotai";

export type DialogMode =
  | "exit"
  | "create-profile"
  | "select-profile"
  | "settings"
  | "about"
  | "youtube"
  | { mode: "language"; song: Song }
  | { mode: "reanalyze-language"; song: Song }
  | { mode: "edit-metadata"; song: Song }
  | { mode: "edit-lyrics"; song: Song }
  | { mode: "set-thumbnail"; song: Song }
  | null;

const dialogAtom = atom<DialogMode>(null);

export const useDialog = () => {
  const [mode, setMode] = useAtom(dialogAtom);

  return {
    mode,
    setMode,
    close() {
      setMode(null);
    },
  };
};
