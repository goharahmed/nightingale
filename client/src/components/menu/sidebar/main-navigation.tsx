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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  isLibraryMenuItemActive,
  libraryFilterFromMenuSelection,
  type LibraryMenuSection,
} from "@/lib/library-menu-filter";
import type { LibraryMenuFilters } from "@/types/LibraryMenuFilters";
import { useLibraryFilter } from "@/hooks/use-library-filter";
import { useMenuFocus } from "@/contexts/menu-focus-context";

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
  items,
  filter,
  isSidebarActive,
  focusedCollapse,
  focusedItemKeys,
  collapseIndex,
  itemIndexByValue,
  open,
  onToggleOpen,
  onSelectItem,
}: Omit<NavSectionConfig, "defaultOpen"> & {
  items: LibraryMenuItem[];
  filter: LibraryMenuFilters;
  isSidebarActive: boolean;
  focusedCollapse: boolean;
  focusedItemKeys: Set<string>;
  collapseIndex: number | undefined;
  itemIndexByValue: Map<string, number>;
  open: boolean;
  onToggleOpen: (open: boolean) => void;
  onSelectItem: (section: LibraryMenuSection, item: LibraryMenuItem) => void;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggleOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            data-sidebar-nav-index={collapseIndex}
            className={`flex w-full justify-between ${
              isSidebarActive && focusedCollapse ? "ring-2 ring-primary bg-sidebar-accent" : ""
            }`}
          >
            <span className="flex items-center gap-2">
              <Icon className="size-4 shrink-0" />
              {label}
            </span>
            <ChevronDown className="transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {items.map((item) => (
              <SidebarMenuSubItem key={`${section}:${item.value}`}>
                <SidebarMenuButton
                  data-sidebar-nav-index={itemIndexByValue.get(item.value)}
                  isActive={isLibraryMenuItemActive(section, item, filter)}
                  className={`flex h-fit items-center justify-between gap-2 px-2 py-1.5 ${
                    isSidebarActive && focusedItemKeys.has(item.value)
                      ? "ring-2 ring-primary bg-sidebar-accent"
                      : ""
                  }`}
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
  registerCallbacks: (callbacks: (() => void)[]) => void;
}

type SidebarNavigationRow =
  | { kind: "collapse"; section: LibraryMenuSection }
  | { kind: "item"; section: LibraryMenuSection; value: string };

export const MainNavigation = ({ registerCallbacks }: MainNavigationProps) => {
  const { data: menu } = useLibraryMenuItems();
  const { setLibraryFilter, ...filter } = useLibraryFilter();
  const { focus } = useMenuFocus();
  const [openBySection, setOpenBySection] = useState<Record<LibraryMenuSection, boolean>>(
    () =>
      Object.fromEntries(
        NAV_SECTIONS.map(({ section, defaultOpen }) => [section, defaultOpen]),
      ) as Record<LibraryMenuSection, boolean>,
  );

  const isSidebarActive = focus.active && focus.panel === "sidebar";

  const selectMenuItem = useCallback(
    (section: LibraryMenuSection, item: LibraryMenuItem) => {
      setLibraryFilter(libraryFilterFromMenuSelection(section, item));
    },
    [setLibraryFilter],
  );

  const visibleSections = useMemo(() => {
    if (!menu) {
      return [];
    }

    return NAV_SECTIONS.map((config) => ({
      ...config,
      visibleItems: menu[config.section].filter(({ count }) => count > 0n),
    })).filter(({ visibleItems }) => visibleItems.length > 0);
  }, [menu]);

  const rows = useMemo<SidebarNavigationRow[]>(() => {
    return visibleSections.flatMap(({ section, visibleItems }) => {
      const sectionRows: SidebarNavigationRow[] = [{ kind: "collapse", section }];
      if (openBySection[section]) {
        sectionRows.push(
          ...visibleItems.map(({ value }) => ({ kind: "item" as const, section, value })),
        );
      }
      return sectionRows;
    });
  }, [visibleSections, openBySection]);

  useEffect(() => {
    const callbacks = rows.map((row) => {
      if (row.kind === "collapse") {
        return () => {
          setOpenBySection((prev) => ({ ...prev, [row.section]: !prev[row.section] }));
        };
      }

      return () => {
        const item = menu?.[row.section].find((entry) => entry.value === row.value);
        if (!item) {
          return;
        }
        selectMenuItem(row.section, item);
      };
    });

    registerCallbacks(callbacks);

    return () => {
      registerCallbacks([]);
    };
  }, [rows, menu, selectMenuItem, registerCallbacks]);

  const collapseIndexBySection = useMemo(() => {
    const indexMap = new Map<LibraryMenuSection, number>();
    rows.forEach((row, index) => {
      if (row.kind === "collapse") {
        indexMap.set(row.section, index);
      }
    });
    return indexMap;
  }, [rows]);

  const itemIndexBySection = useMemo(() => {
    const itemMap = new Map<LibraryMenuSection, Map<string, number>>();

    rows.forEach((row, index) => {
      if (row.kind !== "item") {
        return;
      }

      const sectionMap = itemMap.get(row.section) ?? new Map<string, number>();
      sectionMap.set(row.value, index);
      itemMap.set(row.section, sectionMap);
    });

    return itemMap;
  }, [rows]);

  const focusedItemValueBySection = useMemo(() => {
    const itemMap = new Map<LibraryMenuSection, Set<string>>();

    rows.forEach((row, index) => {
      if (row.kind !== "item" || index !== focus.sidebarIndex) {
        return;
      }

      const sectionValues = itemMap.get(row.section) ?? new Set<string>();
      sectionValues.add(row.value);
      itemMap.set(row.section, sectionValues);
    });

    return itemMap;
  }, [rows, focus.sidebarIndex]);

  useEffect(() => {
    if (!isSidebarActive) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      const focusedItem = document.querySelector<HTMLElement>(
        `[data-sidebar-nav-index="${focus.sidebarIndex}"]`,
      );
      focusedItem?.scrollIntoView({ block: "nearest" });
    });

    return () => cancelAnimationFrame(rafId);
  }, [focus.sidebarIndex, isSidebarActive, rows]);

  if (!menu) {
    return null;
  }

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu>
          {visibleSections.map((config) => (
            <LibraryNavSection
              key={config.section}
              {...config}
              items={config.visibleItems}
              filter={filter}
              isSidebarActive={isSidebarActive}
              focusedCollapse={collapseIndexBySection.get(config.section) === focus.sidebarIndex}
              focusedItemKeys={focusedItemValueBySection.get(config.section) ?? new Set<string>()}
              collapseIndex={collapseIndexBySection.get(config.section)}
              itemIndexByValue={itemIndexBySection.get(config.section) ?? new Map<string, number>()}
              open={openBySection[config.section]}
              onToggleOpen={(open) => {
                setOpenBySection((prev) => ({ ...prev, [config.section]: open }));
              }}
              onSelectItem={selectMenuItem}
            />
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
};
