import { ANALYSIS_QUEUE, FOLDER_TREE, MENU, SONGS, SONGS_META } from "@/queries/keys";
import { useLibraryFilter } from "@/hooks/use-library-filter";
import {
  analyzeMultiSinger,
  deleteSongCache,
  enqueueAll,
  enqueueOne,
  generateTransliteration,
  reanalyzeFull,
  reanalyzeTranscript,
} from "@/tauri-bridge/analysis";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

export const useAnalysis = () => {
  const queryClient = useQueryClient();
  const { artist, album, query, folder_path, folder_recursive, playlist_id } = useLibraryFilter();

  return useMemo(() => {
    const invalidateQueue = () => {
      queryClient.invalidateQueries({ queryKey: ANALYSIS_QUEUE });
    };

    const invalidateSongs = () => {
      queryClient.invalidateQueries({ queryKey: MENU });
      queryClient.invalidateQueries({ queryKey: SONGS });
      queryClient.invalidateQueries({ queryKey: SONGS_META });
      queryClient.invalidateQueries({ queryKey: ANALYSIS_QUEUE });
      queryClient.invalidateQueries({ queryKey: FOLDER_TREE });
    };

    const wrap =
      <A extends unknown[]>(handler: (...args: A) => Promise<void>, invalidate: () => void) =>
      async (...args: A) => {
        try {
          await handler(...args);
          invalidate();
        } catch (error: unknown) {
          toast.error(
            `Error while running an analysis action: ${error instanceof Error ? error.message : "unknown error"}`,
          );
          throw error;
        }
      };

    return {
      enqueueOne: wrap(enqueueOne, invalidateQueue),
      enqueueAll: wrap(
        () => enqueueAll({ artist, album, query, folder_path, folder_recursive, playlist_id }),
        invalidateQueue,
      ),
      deleteSongCache: wrap(deleteSongCache, invalidateSongs),
      reanalyzeTranscript: wrap(reanalyzeTranscript, invalidateSongs),
      reanalyzeFull: wrap(reanalyzeFull, invalidateSongs),
      analyzeMultiSinger: async (fileHash: string) => {
        await analyzeMultiSinger(fileHash);
      },
      invalidateSongs,
      generateTransliteration: wrap(generateTransliteration, invalidateSongs),
    };
  }, [queryClient, artist, album, query, folder_path, folder_recursive, playlist_id]);
};
