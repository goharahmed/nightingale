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
import { useClearCache } from '@/hooks/use-clear-cache';
import { useDialog } from '@/hooks/use-dialog';
import { useConfigMutation } from '@/mutations/use-config-mutation';
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

export const Actions = () => {
  const { setMode } = useDialog();
  const { toggle, theme } = useTheme();

  const clearCache = useClearCache();
  const { mutate } = useConfigMutation();

  const { ThemeIcon, themeLabel } = useMemo(() => {
    return theme === 'dark'
      ? { ThemeIcon: SunIcon, themeLabel: 'Light Mode' }
      : { ThemeIcon: MoonIcon, themeLabel: 'Dark mode' };
  }, [theme]);

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
              <DropdownMenuItem onClick={clearCache.all}>
                <Trash2Icon />
                Clear all cache
              </DropdownMenuItem>
              <DropdownMenuItem onClick={clearCache.videos}>
                <VideoIcon />
                Clear videos cache
              </DropdownMenuItem>
              <DropdownMenuItem onClick={clearCache.models}>
                <BoxIcon />
                Clear models cache
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>General</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setMode('select-profile')}>
                <UserIcon />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMode('settings')}>
                <CogIcon />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  toggle();

                  mutate({ dark_mode: theme === 'dark' ? false : true });
                }}
              >
                <ThemeIcon />
                {themeLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMode('about')}>
                <InfoIcon />
                About
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMode('exit')}>
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
