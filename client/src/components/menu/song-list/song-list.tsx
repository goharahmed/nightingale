import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { SongCard } from './song-card';
import { SongsStore } from '@/types/SongsStore';
import { Filters } from './filters';
import { Progress } from './progress';

interface Props {
  songsStore: SongsStore;
}

const ESTIMATED_ITEM_HEIGHT = 80;
const GAP = 16;

export const SongList = ({ songsStore }: Props) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const { processed } = songsStore;

  const virtualizer = useVirtualizer({
    count: processed.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    gap: GAP,
    overscan: 5,
  });

  return (
    <div className="flex min-h-0 w-full flex-1 justify-center">
      <div className="flex min-h-0 w-3/5 flex-col gap-4 p-4">
        <Filters />
        <Progress songsStore={songsStore} />
        <div ref={parentRef} className="flex-1 overflow-auto p-1" role="list">
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => (
              <div
                key={processed[virtualItem.index].title}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute left-0 w-full"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <SongCard song={processed[virtualItem.index]} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
