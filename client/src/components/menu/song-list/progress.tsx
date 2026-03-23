import { Progress as ShadCnProgress } from '@/components/ui/progress';
import { useSongsMeta } from '@/queries/use-songs';

export const Progress = () => {
  const { data: meta } = useSongsMeta();

  if (!meta) {
    return null;
  }

  const { songs_count, videos_count, analyzed_count, count, processed_count } =
    meta;

  const isScanning = count !== processed_count;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-base text-muted-foreground text-center">
        {songs_count} songs, {videos_count} videos found &bull; {analyzed_count}{' '}
        ready for karaoke
      </span>
      {isScanning && <ShadCnProgress max={count} value={processed_count} />}
    </div>
  );
};
