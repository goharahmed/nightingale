import { atom, useAtom } from 'jotai';

const dialogAtom = atom<
  'exit' | 'create-profile' | 'select-profile' | 'settings' | 'about' | null
>(null);

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
