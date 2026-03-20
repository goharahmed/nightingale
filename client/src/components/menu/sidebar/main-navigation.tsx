import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { SONGS } from '@/queries/keys';
import { useSongs } from '@/queries/use-songs';
import { selectFolder, triggerScan } from '@/tauri-bridge/folder';
import { useQueryClient } from '@tanstack/react-query';
import { FolderIcon, RefreshCwIcon } from 'lucide-react';

export const MainNavigation = () => {
  const { data } = useSongs();
  const queryClient = useQueryClient();

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={async () => {
                  await selectFolder();
                  queryClient.invalidateQueries({ queryKey: SONGS });
                }}
              >
                <FolderIcon />
                <span>Select folder</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled={!data?.folder}
                onClick={async () => {
                  if (!data?.folder) {
                    return;
                  }

                  await triggerScan(data.folder);
                  queryClient.invalidateQueries({ queryKey: SONGS });
                }}
              >
                <RefreshCwIcon />
                <span>Rescan folder</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
};
