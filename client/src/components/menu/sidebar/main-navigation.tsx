import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useMenuFocus } from '@/contexts/menu-focus-context';
import { useFolderActions } from '@/hooks/use-folder-actions';
import { FolderIcon, RefreshCwIcon } from 'lucide-react';
import { useEffect } from 'react';
import type { SidebarCallbacks } from './sidebar';

interface MainNavigationProps {
  sidebarCallbacks: SidebarCallbacks;
}

export const MainNavigation = ({ sidebarCallbacks }: MainNavigationProps) => {
  const { focus } = useMenuFocus();
  const { rescanFolder, rescanFolderDisabled, selectFolder } =
    useFolderActions();

  useEffect(() => {
    sidebarCallbacks.current[0] = selectFolder;
    sidebarCallbacks.current[1] = rescanFolderDisabled ? null : rescanFolder;

    return () => {
      sidebarCallbacks.current[0] = null;
      sidebarCallbacks.current[1] = null;
    };
  }, [sidebarCallbacks, selectFolder, rescanFolder, rescanFolderDisabled]);

  const isSidebarActive = focus.active && focus.panel === 'sidebar';

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={selectFolder}
                className={
                  isSidebarActive && focus.sidebarIndex === 0
                    ? 'ring-2 ring-primary bg-sidebar-accent'
                    : ''
                }
              >
                <FolderIcon />
                <span>Select folder</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled={rescanFolderDisabled}
                onClick={rescanFolder}
                className={
                  isSidebarActive && focus.sidebarIndex === 1
                    ? 'ring-2 ring-primary bg-sidebar-accent'
                    : ''
                }
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
