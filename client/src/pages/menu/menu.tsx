import { ExitDialog } from '@/components/menu/dialogs/exit';
import { InfoDialog } from '@/components/menu/dialogs/info';
import { CreateProfileDialog } from '@/components/menu/dialogs/profile/create';
import { SelectProfileDialog } from '@/components/menu/dialogs/profile/select';
import { SettingsDialog } from '@/components/menu/dialogs/settings';
import { Sidebar } from '@/components/menu/sidebar/sidebar';
import { EmptySongList } from '@/components/menu/song-list/empty-song-list';
import { SongList } from '@/components/menu/song-list/song-list';
import { SidebarInset } from '@/components/ui/sidebar';
import { useSongs } from '@/queries/use-songs';

export const Menu = () => {
  const { data: songsStore } = useSongs();

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
