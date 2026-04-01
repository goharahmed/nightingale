import { useQuery } from "@tanstack/react-query";
import { MENU } from "./keys";
import { loadLibraryMenuItems } from "@/tauri-bridge/library";

export const useLibraryMenuItems = () => {
  return useQuery({
    queryKey: MENU,
    queryFn: loadLibraryMenuItems,
  });
};
