import { atom, useAtom } from 'jotai';

const profileDialogModeAtom = atom<'create' | 'select' | null>(null);

export const useProfileDialog = () => {
  const [mode, setMode] = useAtom(profileDialogModeAtom);

  return {
    mode,
    setMode,
  };
};
