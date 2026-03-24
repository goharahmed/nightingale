import { useBestScoresBySongForActiveProfile } from '@/hooks/use-best-scores-by-song';
import { useEffect, useMemo, useRef } from 'react';
import { SongCard } from './song-card';
import { Filters } from './filters';
import { Progress } from './progress';
import { useAnalysisQueue, useSongs } from '@/queries/use-songs';

export const SongList = () => {
  const { data: queue } = useAnalysisQueue();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSongs();
  const bestBySong = useBestScoresBySongForActiveProfile();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const songs = useMemo(
    () => data?.pages.flatMap((page) => page.processed) ?? [],
    [data],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex min-h-0 w-full flex-1 justify-center">
      <div className="flex min-h-0 w-3/5 flex-col gap-4 p-4">
        <Filters />
        <div className="flex flex-col gap-3">
          <Progress />
          <div
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto overscroll-contain p-1"
            role="list"
          >
            {songs.map((song) => (
              <SongCard
                key={song.file_hash}
                song={song}
                queueStatus={queue?.entries[song.file_hash]}
                bestScore={bestBySong.get(song.file_hash)}
              />
            ))}
            <div ref={sentinelRef} className="h-1 shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
};
