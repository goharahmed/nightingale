import { atom, useAtom } from 'jotai';

const infoDialogOpenAtom = atom(false);

export const useInfoDialog = () => {
  const [open, setOpen] = useAtom(infoDialogOpenAtom);

  return {
    open,
    setOpen,
  };
};
