import { ExitDialog } from '@/components/menu/dialogs/exit';
import { InfoDialog } from '@/components/menu/dialogs/info';
import { CreateProfileDialog } from '@/components/menu/dialogs/profile/create';
import { SelectProfileDialog } from '@/components/menu/dialogs/profile/select';
import { SettingsDialog } from '@/components/menu/dialogs/settings';
import { Sidebar } from '@/components/menu/sidebar/sidebar';
import { EmptySongList } from '@/components/menu/song-list/empty-song-list';
import { SongList } from '@/components/menu/song-list/song-list';
import { SidebarInset } from '@/components/ui/sidebar';
import { useDialog } from '@/hooks/use-dialog';
import { useSongsMeta } from '@/queries/use-songs';
import { useEffect } from 'react';

export const Menu = () => {
  const { data: meta } = useSongsMeta();
  const { setMode } = useDialog();

  useEffect(() => {
    const openExitModal = ({ key }: KeyboardEvent) => {
      if (key === 'Escape') {
        setMode((mode) => {
          if (mode === null) {
            return 'exit';
          }

          if (mode === 'exit') {
            return null;
          }

          return mode;
        });
      }
    };

    document.addEventListener('keydown', openExitModal);

    return () => {
      document.removeEventListener('keydown', openExitModal);
    };
  }, []);

  return (
    <Sidebar>
      <ExitDialog />
      <SettingsDialog />
      <CreateProfileDialog />
      <SelectProfileDialog />
      <InfoDialog />
      <SidebarInset>
        {meta?.folder ? <SongList /> : <EmptySongList />}
      </SidebarInset>
    </Sidebar>
  );
};
