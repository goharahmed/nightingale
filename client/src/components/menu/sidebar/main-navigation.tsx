import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useFolderActions } from '@/hooks/use-folder-actions';
import { FolderIcon, RefreshCwIcon } from 'lucide-react';

export const MainNavigation = () => {
  const { rescanFolder, rescanFolderDisabled, selectFolder } =
    useFolderActions();

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={selectFolder}>
                <FolderIcon />
                <span>Select folder</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled={rescanFolderDisabled}
                onClick={rescanFolder}
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
