import { useQuery } from "@tanstack/react-query";
import { FOLDER_TREE } from "./keys";
import { getFolderTree } from "@/tauri-bridge/library";

export const useFolderTree = () => {
  return useQuery({
    queryKey: FOLDER_TREE,
    queryFn: getFolderTree,
  });
};
