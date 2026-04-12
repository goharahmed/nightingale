import { useLibraryFilter } from "./use-library-filter";
import { EMPTY_LIBRARY_FILTER } from "@/lib/library-menu-filter";
import { useCallback } from "react";

export const useFolderNavigation = () => {
  const { folder_path, folder_recursive, setLibraryFilter } = useLibraryFilter();

  const navigateToFolder = useCallback(
    (path: string | null) => {
      setLibraryFilter({
        ...EMPTY_LIBRARY_FILTER,
        folder_path: path,
        folder_recursive,
      });
    },
    [setLibraryFilter, folder_recursive],
  );

  const toggleRecursive = useCallback(() => {
    setLibraryFilter((prev) => ({
      ...prev,
      folder_recursive: !prev.folder_recursive,
    }));
  }, [setLibraryFilter]);

  return {
    currentFolder: folder_path,
    isRecursive: folder_recursive,
    navigateToFolder,
    toggleRecursive,
  };
};
