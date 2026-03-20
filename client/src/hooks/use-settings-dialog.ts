import { atom, useAtom } from 'jotai';

const settingsDialogOpenAtom = atom(false);

export const useSettingsDialog = () => {
  const [open, setOpen] = useAtom(settingsDialogOpenAtom);

  return {
    open,
    setOpen,
  };
};
