import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useFolderTree } from "@/queries/use-folder-tree";
import { useFolderNavigation } from "@/hooks/use-folder-navigation";
import { useSongsMeta } from "@/queries/use-songs";
import type { FolderTreeNode } from "@/types/FolderTreeNode";
import { ChevronRight, FolderIcon, FolderOpenIcon, LibraryIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useMenuFocus } from "@/contexts/menu-focus-context";

interface FolderTreeItemProps {
  node: FolderTreeNode;
  currentFolder: string | null;
  onNavigate: (path: string | null) => void;
  isSidebarActive: boolean;
  focusedIndex: number;
  getNodeIndex: (path: string) => number | undefined;
  getCollapseIndex: (path: string) => number | undefined;
}

const FolderTreeItem = memo(
  ({
    node,
    currentFolder,
    onNavigate,
    isSidebarActive,
    focusedIndex,
    getNodeIndex,
    getCollapseIndex,
  }: FolderTreeItemProps) => {
    const [open, setOpen] = useState(false);
    const isActive = currentFolder === node.path;
    const hasChildren = node.children.length > 0;
    const nodeIdx = getNodeIndex(node.path);
    const isFocused = isSidebarActive && nodeIdx === focusedIndex;

    return (
      <SidebarMenuSubItem>
        <SidebarMenuButton
          data-sidebar-nav-index={nodeIdx}
          isActive={isActive}
          className={`flex h-fit items-center gap-1.5 px-2 py-1.5 ${
            isFocused ? "ring-2 ring-primary bg-sidebar-accent" : ""
          }`}
          onClick={() => {
            onNavigate(node.path);
            if (hasChildren && !open) setOpen(true);
          }}
        >
          {hasChildren ? (
            <ChevronRight
              className={`size-3 shrink-0 cursor-pointer transition-transform ${open ? "rotate-90" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(!open);
              }}
            />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          {open ? (
            <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate">{node.name}</span>
          <Badge className="ml-auto h-5 shrink-0 border-0 bg-muted px-1.5 text-[0.65rem] font-medium text-muted-foreground">
            {node.total_song_count}
          </Badge>
        </SidebarMenuButton>
        {hasChildren && open && (
          <SidebarMenuSub className="mr-0 pr-0">
            {node.children.map((child) => (
              <FolderTreeItem
                key={child.path}
                node={child}
                currentFolder={currentFolder}
                onNavigate={onNavigate}
                isSidebarActive={isSidebarActive}
                focusedIndex={focusedIndex}
                getNodeIndex={getNodeIndex}
                getCollapseIndex={getCollapseIndex}
              />
            ))}
          </SidebarMenuSub>
        )}
      </SidebarMenuSubItem>
    );
  },
);

FolderTreeItem.displayName = "FolderTreeItem";

interface FolderNavigationProps {
  registerCallbacks: (callbacks: (() => void)[]) => void;
}

export const FolderNavigation = ({ registerCallbacks }: FolderNavigationProps) => {
  const { data: tree, isLoading } = useFolderTree();
  const { data: meta } = useSongsMeta();
  const { currentFolder, navigateToFolder } = useFolderNavigation();
  const { focus } = useMenuFocus();

  const isSidebarActive = focus.active && focus.panel === "sidebar";

  // Build a flat index for keyboard navigation
  const flatPaths = useMemo(() => {
    if (!tree) return ["__all__"];
    const paths: string[] = ["__all__"];
    const collectVisible = (nodes: FolderTreeNode[]) => {
      for (const node of nodes) {
        paths.push(node.path);
      }
    };
    collectVisible(tree);
    return paths;
  }, [tree]);

  const nodeIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flatPaths.forEach((p, i) => map.set(p, i));
    return map;
  }, [flatPaths]);

  const getNodeIndex = useCallback((path: string) => nodeIndexMap.get(path), [nodeIndexMap]);

  const getCollapseIndex = useCallback((_path: string) => undefined, []);

  // Register callbacks for gamepad/keyboard confirm
  useEffect(() => {
    const callbacks = flatPaths.map((p) => {
      if (p === "__all__") {
        return () => navigateToFolder(null);
      }
      return () => navigateToFolder(p);
    });
    registerCallbacks(callbacks);
    return () => registerCallbacks([]);
  }, [flatPaths, navigateToFolder, registerCallbacks]);

  if (isLoading || !tree) {
    return (
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem className="px-1 py-2">
              <div className="space-y-1">
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    );
  }

  const totalSongs = meta?.processed_count ?? 0;

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu>
          {/* "All Songs" root entry */}
          <SidebarMenuItem>
            <SidebarMenuButton
              data-sidebar-nav-index={0}
              isActive={currentFolder === null}
              className={`flex items-center gap-2 ${
                isSidebarActive && focus.sidebarIndex === 0
                  ? "ring-2 ring-primary bg-sidebar-accent"
                  : ""
              }`}
              onClick={() => navigateToFolder(null)}
            >
              <LibraryIcon className="size-4 shrink-0" />
              <span>All Songs</span>
              <Badge className="ml-auto h-5 border-0 bg-muted px-1.5 text-[0.65rem] font-medium text-muted-foreground">
                {totalSongs}
              </Badge>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Folder tree */}
          {tree.length > 0 && (
            <SidebarMenuItem>
              <SidebarMenuSub className="mr-0 pr-0">
                {tree.map((node) => (
                  <FolderTreeItem
                    key={node.path}
                    node={node}
                    currentFolder={currentFolder}
                    onNavigate={navigateToFolder}
                    isSidebarActive={isSidebarActive}
                    focusedIndex={focus.sidebarIndex}
                    getNodeIndex={getNodeIndex}
                    getCollapseIndex={getCollapseIndex}
                  />
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
};
