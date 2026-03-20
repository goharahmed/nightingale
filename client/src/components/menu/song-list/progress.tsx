import { useMemo } from 'react';
import { Progress as ShadCnProgress } from '@/components/ui/progress';
import { SongsStore } from '@/types/SongsStore';
import { useSearch } from '@/hooks/use-search';

interface Counts {
  songsCount: number;
  videosCount: number;
  analyzedCount: number;
}

const defaultCounts = { songsCount: 0, videosCount: 0, analyzedCount: 0 };

interface Props {
  songsStore: SongsStore;
}

export const Progress = ({ songsStore: { processed, count } }: Props) => {
  const { search } = useSearch();

  const { songsCount, videosCount, analyzedCount } = useMemo(
    () =>
      processed.reduce<Counts>((carry, next) => {
        const newCarry = { ...carry };

        if (next.is_video) {
          newCarry.videosCount += 1;
        } else {
          newCarry.songsCount += 1;
        }

        if (
          typeof next.analysis_status === 'object' &&
          Object.keys(next.analysis_status)[0] === 'Ready'
        ) {
          newCarry.analyzedCount += 1;
        }

        return newCarry;
      }, defaultCounts),
    [processed],
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-base text-muted-foreground text-center">
        {songsCount} songs, {videosCount} videos found • {analyzedCount} ready
        for karaoke
      </span>
      {count !== processed.length && !search && (
        <ShadCnProgress max={count} value={processed.length} />
      )}
    </div>
  );
};
