import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown, Flame, FileQuestionMark, DiscIcon, UserIcon } from "lucide-react";
import { useLibraryMenuItems } from "@/queries/use-library-menu-items";
import { LibraryMenuItem } from "@/types/LibraryMenuItem";
import { ReactNode, useMemo } from "react";
import { Badge } from "@/components/ui/badge";

interface CollapsibleBlockProps {
  items: LibraryMenuItem[];
  icon: ReactNode;
  label: string;
  defaultOpen?: boolean;
}

const CollapsibleBlock = ({ items, icon, label, defaultOpen = true }: CollapsibleBlockProps) => {
  const filtered = useMemo(() => items.filter(({ count }) => count), [items]);

  if (filtered.length === 0) {
    return;
  }

  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="flex justify-between w-full">
            <span className="flex items-center gap-2">
              {icon}
              {label}
            </span>

            <ChevronDown className="transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="pr-0 mr-0">
            {filtered.map(({ label, analysedCount, count }) => (
              <SidebarMenuSubItem>
                <SidebarMenuButton className="flex align-center gap-2 justify-between px-2 h-fit py-1.5">
                  {label}

                  <div className="flex gap-1">
                    {count !== analysedCount && (
                      <Badge className="h-5 border-0 bg-muted px-1.5 text-[0.65rem] font-medium text-muted-foreground">
                        {count}
                      </Badge>
                    )}
                    {analysedCount > 0 && (
                      <Badge className="h-5 border-0 bg-chart-3/15 px-1.5 text-[0.65rem] font-medium text-chart-3 dark:bg-chart-3/20">
                        {analysedCount}
                      </Badge>
                    )}
                  </div>
                </SidebarMenuButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
};

interface MainNavigationProps {
  sidebarCallbacks?: unknown;
}

export const MainNavigation = (_props: MainNavigationProps) => {
  const { data: menu } = useLibraryMenuItems();

  if (!menu) {
    return;
  }

  const { hot, no_metadata, artists, albums } = menu;

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu>
          <CollapsibleBlock items={hot} label="Quick Filters" icon={<Flame />} />
          <CollapsibleBlock
            items={no_metadata}
            label="No Metadata"
            icon={<FileQuestionMark />}
            defaultOpen={false}
          />
          <CollapsibleBlock
            items={artists}
            label="Artists"
            icon={<UserIcon />}
            defaultOpen={false}
          />
          <CollapsibleBlock items={albums} label="Albums" icon={<DiscIcon />} defaultOpen={false} />
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
};
