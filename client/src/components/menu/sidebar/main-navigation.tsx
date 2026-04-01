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
import {
  ChevronDown,
  Flame,
  FileQuestionMark,
  DiscIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import { useLibraryMenuItems } from "@/queries/use-library-menu-items";
import type { LibraryMenuItem } from "@/types/LibraryMenuItem";
import { useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  isLibraryMenuItemActive,
  libraryFilterFromMenuSelection,
  type LibraryMenuSection,
} from "@/lib/library-menu-filter";
import type { LibraryMenuFilters } from "@/types/LibraryMenuFilters";
import { useLibraryFilter } from "@/hooks/use-library-filter";

type NavSectionConfig = {
  section: LibraryMenuSection;
  label: string;
  icon: LucideIcon;
  defaultOpen: boolean;
};

const NAV_SECTIONS: NavSectionConfig[] = [
  { section: "hot", label: "Quick Filters", icon: Flame, defaultOpen: true },
  { section: "no_metadata", label: "No Metadata", icon: FileQuestionMark, defaultOpen: false },
  { section: "artists", label: "Artists", icon: UserIcon, defaultOpen: false },
  { section: "albums", label: "Albums", icon: DiscIcon, defaultOpen: false },
];

function MenuItemCounts({ item }: { item: LibraryMenuItem }) {
  return (
    <div className="flex gap-1">
      {item.count !== item.analysedCount && (
        <Badge className="h-5 border-0 bg-muted px-1.5 text-[0.65rem] font-medium text-muted-foreground">
          {item.count.toString()}
        </Badge>
      )}
      {item.analysedCount > 0n && (
        <Badge className="h-5 border-0 bg-chart-3/15 px-1.5 text-[0.65rem] font-medium text-chart-3 dark:bg-chart-3/20">
          {item.analysedCount.toString()}
        </Badge>
      )}
    </div>
  );
}

function LibraryNavSection({
  section,
  label,
  icon: Icon,
  defaultOpen,
  items,
  filter,
  onSelectItem,
}: NavSectionConfig & {
  items: LibraryMenuItem[];
  filter: LibraryMenuFilters;
  onSelectItem: (section: LibraryMenuSection, item: LibraryMenuItem) => void;
}) {
  const visibleItems = useMemo(() => items.filter(({ count }) => count > 0n), [items]);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="flex w-full justify-between">
            <span className="flex items-center gap-2">
              <Icon className="size-4 shrink-0" />
              {label}
            </span>
            <ChevronDown className="transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {visibleItems.map((item) => (
              <SidebarMenuSubItem key={`${section}:${item.value}`}>
                <SidebarMenuButton
                  isActive={isLibraryMenuItemActive(section, item, filter)}
                  className="flex h-fit items-center justify-between gap-2 px-2 py-1.5"
                  onClick={() => onSelectItem(section, item)}
                >
                  {item.label}
                  <MenuItemCounts item={item} />
                </SidebarMenuButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

interface MainNavigationProps {
  sidebarCallbacks?: unknown;
}

export const MainNavigation = (_props: MainNavigationProps) => {
  const { data: menu } = useLibraryMenuItems();
  const { setLibraryFilter, ...filter } = useLibraryFilter();

  const selectMenuItem = useCallback(
    (section: LibraryMenuSection, item: LibraryMenuItem) => {
      setLibraryFilter(libraryFilterFromMenuSelection(section, item));
    },
    [setLibraryFilter],
  );

  if (!menu) {
    return null;
  }

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu>
          {NAV_SECTIONS.map((config) => (
            <LibraryNavSection
              key={config.section}
              {...config}
              items={menu[config.section]}
              filter={filter}
              onSelectItem={selectMenuItem}
            />
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
};
