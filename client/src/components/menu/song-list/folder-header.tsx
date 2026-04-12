import { useFolderNavigation } from "@/hooks/use-folder-navigation";
import { useFolderTree } from "@/queries/use-folder-tree";
import { useSongsMeta } from "@/queries/use-songs";
import type { FolderTreeNode } from "@/types/FolderTreeNode";
import { ChevronRight, FolderIcon, ListTreeIcon, FolderClosedIcon } from "lucide-react";
import { useMemo } from "react";

function findFolderNode(nodes: FolderTreeNode[], path: string): FolderTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findFolderNode(node.children, path);
    if (found) return found;
  }
  return undefined;
}

function Breadcrumbs({
  currentPath,
  rootPath,
  onNavigate,
}: {
  currentPath: string;
  rootPath: string;
  onNavigate: (path: string | null) => void;
}) {
  const relative = currentPath.startsWith(rootPath + "/")
    ? currentPath.slice(rootPath.length + 1)
    : currentPath;
  const parts = relative.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap py-1">
      <button
        onClick={() => onNavigate(null)}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        Library
      </button>
      {parts.map((part, i) => {
        const partPath = rootPath + "/" + parts.slice(0, i + 1).join("/");
        const isLast = i === parts.length - 1;
        return (
          <span key={partPath} className="flex items-center gap-1">
            <ChevronRight className="size-3 text-muted-foreground" />
            {isLast ? (
              <span className="font-medium text-foreground">{part}</span>
            ) : (
              <button
                onClick={() => onNavigate(partPath)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function SubfolderCard({
  node,
  onNavigate,
}: {
  node: FolderTreeNode;
  onNavigate: (path: string) => void;
}) {
  return (
    <button
      onClick={() => onNavigate(node.path)}
      className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <FolderIcon className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{node.name}</p>
        <p className="text-xs text-muted-foreground">
          {node.total_song_count} {node.total_song_count === 1 ? "song" : "songs"}
          {node.children.length > 0 &&
            ` · ${node.children.length} ${node.children.length === 1 ? "folder" : "folders"}`}
        </p>
      </div>
    </button>
  );
}

export const FolderHeader = () => {
  const { data: tree } = useFolderTree();
  const { data: meta } = useSongsMeta();
  const { currentFolder, isRecursive, navigateToFolder, toggleRecursive } = useFolderNavigation();

  const rootPath = meta?.folder?.replace(/\/$/, "") ?? "";

  const currentNode = useMemo(() => {
    if (!tree || !currentFolder) return undefined;
    return findFolderNode(tree, currentFolder);
  }, [tree, currentFolder]);

  const subfolders = currentNode?.children ?? [];

  if (!currentFolder) return null;

  return (
    <div className="flex flex-col gap-2 pb-2">
      {/* Breadcrumbs + recursive toggle */}
      <div className="flex items-center justify-between gap-4">
        <Breadcrumbs
          currentPath={currentFolder}
          rootPath={rootPath}
          onNavigate={navigateToFolder}
        />
        <button
          onClick={toggleRecursive}
          className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
            isRecursive
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:bg-accent"
          }`}
          title={
            isRecursive
              ? "Showing songs from all subfolders"
              : "Showing songs from this folder only"
          }
        >
          {isRecursive ? (
            <ListTreeIcon className="size-3.5" />
          ) : (
            <FolderClosedIcon className="size-3.5" />
          )}
          {isRecursive ? "All subfolders" : "This folder"}
        </button>
      </div>

      {/* Subfolder cards */}
      {subfolders.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {subfolders.map((node) => (
            <SubfolderCard
              key={node.path}
              node={node}
              onNavigate={(path) => navigateToFolder(path)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
