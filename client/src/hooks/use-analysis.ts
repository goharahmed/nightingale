import { SONGS } from '@/queries/keys';
import {
  deleteSongCache,
  enqueueAll,
  enqueueOne,
  reanalyzeFull,
  reanalyzeTranscript,
} from '@/tauri-bridge/analysis';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const useAnalysis = () => {
  const queryClient = useQueryClient();

  const analysisFactory = <T>(handler: (fileHash: T) => Promise<void>) => {
    return async (fileHash: T) => {
      try {
        await handler(fileHash);

        queryClient.invalidateQueries({ queryKey: SONGS });
      } catch (error: unknown) {
        toast.error(
          `Error while running an analysis action: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    };
  };

  return {
    enqueueOne: analysisFactory(enqueueOne),
    enqueueAll: analysisFactory(enqueueAll),
    deleteSongCache: analysisFactory(deleteSongCache),
    reanalyzeTranscript: analysisFactory(reanalyzeTranscript),
    reanalyzeFull: analysisFactory(reanalyzeFull),
  };
};
