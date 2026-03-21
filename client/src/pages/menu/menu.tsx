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
import { useSongs } from '@/queries/use-songs';
import { useEffect } from 'react';

export const Menu = () => {
  const { data: songsStore } = useSongs();
  const { setMode } = useDialog();

  useEffect(() => {
    const openExitModal = ({ key }: KeyboardEvent) => {
      if (key === 'Escape') {
        setMode((mode) => (mode === null ? 'exit' : mode));
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
        {songsStore?.folder ? (
          <SongList songsStore={songsStore} />
        ) : (
          <EmptySongList />
        )}
      </SidebarInset>
    </Sidebar>
  );
};
