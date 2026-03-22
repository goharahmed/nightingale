import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef } from 'react';
import { SongCard } from './song-card';
import { Filters } from './filters';
import { Progress } from './progress';
import { useAnalysisQueue, useSongs } from '@/queries/use-songs';

const ESTIMATED_ITEM_HEIGHT = 80;
const GAP = 16;
const LOAD_MORE_THRESHOLD = 10;

export const SongList = () => {
  const parentRef = useRef<HTMLDivElement>(null);

  const { data: queue } = useAnalysisQueue();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSongs();

  const songs = useMemo(
    () => data?.pages.flatMap((page) => page.processed) ?? [],
    [data],
  );

  const virtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    gap: GAP,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];

  useEffect(() => {
    if (!lastItem) return;

    if (
      lastItem.index >= songs.length - LOAD_MORE_THRESHOLD &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    lastItem?.index,
    songs.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  return (
    <div className="flex min-h-0 w-full flex-1 justify-center">
      <div className="flex min-h-0 w-3/5 flex-col gap-4 p-4">
        <Filters />
        <div className="flex flex-col gap-2">
          <Progress />
          <div ref={parentRef} className="flex-1 overflow-auto p-1" role="list">
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualItems.map((virtualItem) => {
                const song = songs[virtualItem.index];
                return (
                  <div
                    key={song.file_hash}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    className="absolute top-0 left-0 w-full"
                    style={{
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <SongCard
                      song={song}
                      queueStatus={queue?.entries[song.file_hash]}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
