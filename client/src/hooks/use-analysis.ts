import { ANALYSIS_QUEUE, SONGS, SONGS_META } from '@/queries/keys';
import {
  deleteSongCache,
  enqueueAll,
  enqueueOne,
  reanalyzeFull,
  reanalyzeTranscript,
} from '@/tauri-bridge/analysis';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';

export const useAnalysis = () => {
  const queryClient = useQueryClient();

  return useMemo(() => {
    const invalidateQueue = () => {
      queryClient.invalidateQueries({ queryKey: ANALYSIS_QUEUE });
    };

    const invalidateSongs = () => {
      queryClient.invalidateQueries({ queryKey: SONGS });
      queryClient.invalidateQueries({ queryKey: SONGS_META });
      queryClient.invalidateQueries({ queryKey: ANALYSIS_QUEUE });
    };

    const wrap =
      <A extends unknown[]>(
        handler: (...args: A) => Promise<void>,
        invalidate: () => void,
      ) =>
      async (...args: A) => {
        try {
          await handler(...args);
          invalidate();
        } catch (error: unknown) {
          toast.error(
            `Error while running an analysis action: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      };

    return {
      enqueueOne: wrap(enqueueOne, invalidateQueue),
      enqueueAll: wrap(enqueueAll, invalidateQueue),
      deleteSongCache: wrap(deleteSongCache, invalidateSongs),
      reanalyzeTranscript: wrap(reanalyzeTranscript, invalidateSongs),
      reanalyzeFull: wrap(reanalyzeFull, invalidateSongs),
    };
  }, [queryClient]);
};
