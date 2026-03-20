import { atom, useAtom } from 'jotai';

const exitDialogOpenAtom = atom(false);

export const useExitDialog = () => {
  const [open, setOpen] = useAtom(exitDialogOpenAtom);

  return {
    open,
    setOpen,
  };
};
