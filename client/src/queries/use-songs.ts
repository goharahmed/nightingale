import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ANALYSIS_QUEUE, SONGS, SONGS_META } from './keys';
import {
  getPreloadedSongsMeta,
  loadAnalysisQueue,
  loadSongs,
  loadSongsMeta,
} from '@/tauri-bridge/songs';
import { useSearch } from '@/hooks/use-search';
import { useRef, useState } from 'react';
import type { AnalysisQueue } from '@/types/AnalysisQueue';
import { SongsMeta } from '@/types/SongsMeta';

const PAGE_SIZE = 25;
const DEFAULT_REFETCH_INTERVAL = 2500;

export const useSongsMeta = () => {
  const queryClient = useQueryClient();
  const [prevMatched, setPrevMatched] = useState(true);
  const preloaded = getPreloadedSongsMeta();

  return useQuery({
    queryKey: SONGS_META,
    queryFn: loadSongsMeta,
    refetchInterval: DEFAULT_REFETCH_INTERVAL,
    ...(preloaded !== undefined ? { initialData: preloaded } : {}),
    onSuccess: ({ count, processed_count }: SongsMeta) => {
      if (count !== processed_count) {
        setPrevMatched(false);
        queryClient.invalidateQueries({ queryKey: SONGS });
      } else {
        if (prevMatched === false) {
          setPrevMatched(true);
          queryClient.invalidateQueries({ queryKey: SONGS });
        }
      }
    },
  });
};

export const useSongs = () => {
  const { search } = useSearch();

  return useInfiniteQuery({
    queryKey: [...SONGS, search],
    queryFn: ({ pageParam = 0 }) =>
      loadSongs(search || undefined, pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (sum, page) => sum + page.processed.length,
        0,
      );
      return loaded < lastPage.processed_count ? loaded : undefined;
    },
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
