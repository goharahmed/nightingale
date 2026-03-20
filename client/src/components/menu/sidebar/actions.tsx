import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useExitDialog } from '@/hooks/use-exit-dialog';
import { useInfoDialog } from '@/hooks/use-info-dialog';
import { useProfileDialog } from '@/hooks/use-profile-dialog';
import { useSettingsDialog } from '@/hooks/use-settings-dialog';
import { useTheme } from '@/providers/theme/ThemeProvider';
import {
  BoxIcon,
  ChevronsUpDownIcon,
  CogIcon,
  DoorOpenIcon,
  InfoIcon,
  MoonIcon,
  SunIcon,
  Trash2Icon,
  UserIcon,
  VideoIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';

export const Actions = () => {
  const { toggle, theme } = useTheme();
  const { setOpen: setExitDialogOpen } = useExitDialog();
  const { setOpen: setSettingsDialogOpen } = useSettingsDialog();
  const { setOpen: setInfoDialogOpen } = useInfoDialog();
  const { setMode: setProfileDialogMode } = useProfileDialog();

  const ThemeIcon = useMemo(() => {
    return theme === 'dark' ? SunIcon : MoonIcon;
  }, [theme]);

  const themeLabel = theme === 'dark' ? 'Light mode' : 'Dark mode';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar>
                <AvatarFallback>TS</AvatarFallback>
              </Avatar>
              <span className="truncate font-medium">Username</span>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="min-w-56">
            <DropdownMenuLabel>Cache</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => toast.info('All cache cleared')}>
                <Trash2Icon />
                Clear all cache
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toast.info('Videos cache cleared')}
              >
                <VideoIcon />
                Clear videos cache
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toast.info('Models cache cleared')}
              >
                <BoxIcon />
                Clear models cache
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>General</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setProfileDialogMode('select')}>
                <UserIcon />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSettingsDialogOpen(true)}>
                <CogIcon />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggle}>
                <ThemeIcon />
                {themeLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setInfoDialogOpen(true)}>
                <InfoIcon />
                About
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setExitDialogOpen(true)}>
                <DoorOpenIcon />
                Exit
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
