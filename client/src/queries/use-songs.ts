import { useQuery } from '@tanstack/react-query';
import { SONGS } from './keys';
import { loadSongs } from '@/tauri-bridge/songs';
import { useSearch } from '@/hooks/use-search';

export const useSongs = () => {
  const { search } = useSearch();

  return useQuery({
    queryKey: [...SONGS, search],
    queryFn: () => loadSongs(search ? search : undefined),
    refetchInterval: 500,
    placeholderData: (previousData) => previousData,
  });
}
