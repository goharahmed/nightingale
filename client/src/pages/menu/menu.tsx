import { ExitDialog } from '@/components/menu/dialogs/exit';
import { CreateProfileDialog } from '@/components/menu/dialogs/profile/create';
import { SelectProfileDialog } from '@/components/menu/dialogs/profile/select';
import { SettingsDialog } from '@/components/menu/dialogs/settings';
import { Sidebar } from '@/components/menu/sidebar/sidebar';

export const Menu = () => {
  return (
    <div>
      <ExitDialog />
      <SettingsDialog />
      <CreateProfileDialog />
      <SelectProfileDialog />
      <Sidebar />
    </div>
  );
};
