import { LibraryMenuItems } from "@/types/LibraryMenuItems";
import type { FolderTreeNode } from "@/types/FolderTreeNode";
import { invoke } from "@tauri-apps/api/core";

export const loadLibraryMenuItems = async (): Promise<LibraryMenuItems> => {
  return await invoke<LibraryMenuItems>("load_library_menu_items");
};

export const getFolderTree = async (): Promise<FolderTreeNode[]> => {
  return await invoke<FolderTreeNode[]>("get_folder_tree");
};
