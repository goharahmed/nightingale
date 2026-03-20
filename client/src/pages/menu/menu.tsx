import { ExitDialog } from '@/components/menu/dialogs/exit';
import { InfoDialog } from '@/components/menu/dialogs/info';
import { CreateProfileDialog } from '@/components/menu/dialogs/profile/create';
import { SelectProfileDialog } from '@/components/menu/dialogs/profile/select';
import { SettingsDialog } from '@/components/menu/dialogs/settings';
import { Filters } from '@/components/menu/filters/filters';
import { Sidebar } from '@/components/menu/sidebar/sidebar';
import { SongList } from '@/components/menu/song-list/song-list';
import { SidebarInset } from '@/components/ui/sidebar';

export const Menu = () => {
  return (
    <Sidebar>
      <ExitDialog />
      <SettingsDialog />
      <CreateProfileDialog />
      <SelectProfileDialog />
      <InfoDialog />
      <SidebarInset>
        <div className="w-full flex justify-center">
          <div className="flex w-3/5 flex-col gap-4 p-4">
            <Filters />
            <span className="text-base text-muted-foreground text-center">
              35 songs, 2 videos found • 1 ready for karaoke
            </span>
            <SongList />
          </div>
        </div>
      </SidebarInset>
    </Sidebar>
  );
};
