import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ANALYSIS_QUEUE, SONGS, SONGS_META } from './keys';
import {
  loadAnalysisQueue,
  loadSongs,
  loadSongsMeta,
} from '@/tauri-bridge/songs';
import { useSearch } from '@/hooks/use-search';
import { useRef } from 'react';
import type { AnalysisQueue } from '@/types/AnalysisQueue';

const PAGE_SIZE = 50;
const DEFAULT_REFETCH_INTERVAL = 2500

export const useSongsMeta = () => {
  return useQuery({
    queryKey: SONGS_META,
    queryFn: loadSongsMeta,
    refetchInterval: DEFAULT_REFETCH_INTERVAL,
  });
};

export const useSongs = () => {
  const { search } = useSearch();
  const { data: { processed_count, count } = {} } = useSongsMeta();

  return useInfiniteQuery({
    queryKey: [...SONGS, search],
    queryFn: ({ pageParam }) =>
      loadSongs(search || undefined, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (sum, page) => sum + page.processed.length,
        0,
      );
      return loaded < lastPage.processed_count ? loaded : undefined;
    },
    refetchInterval: count !== processed_count ? DEFAULT_REFETCH_INTERVAL : undefined
  });
};

export const useAnalysisQueue = () => {
  const queryClient = useQueryClient();
  const prevKeysRef = useRef<Set<string>>(new Set());

  return useQuery({
    queryKey: ANALYSIS_QUEUE,
    queryFn: loadAnalysisQueue,
    refetchInterval: 2500,
    select: (data: AnalysisQueue) => {
      const currentKeys = new Set(Object.keys(data.entries));
      const prevKeys = prevKeysRef.current;

      if (prevKeys.size > 0) {
        for (const key of prevKeys) {
          if (!currentKeys.has(key)) {
            queryClient.invalidateQueries({ queryKey: SONGS });
            queryClient.invalidateQueries({ queryKey: SONGS_META });
            break;
          }
        }
      }

      prevKeysRef.current = currentKeys;
      return data;
    },
  });
};
