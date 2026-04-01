import { LibraryMenuItems } from "@/types/LibraryMenuItems";
import { invoke } from "@tauri-apps/api/core";

export const loadLibraryMenuItems = async (): Promise<LibraryMenuItems> => {
  return await invoke<LibraryMenuItems>("load_library_menu_items");
};
