import { SegmentedProgress } from '@/components/ui/segmented-progress';
import { useCacheStats } from '@/queries/use-cache-stats';
import { formatBytes, segmentPercent, totalUsedBytes } from '@/utils/stats';

const rows = [
  { label: 'Songs', color: 'bg-blue-500', key: 'songs_bytes' as const },
  { label: 'Videos', color: 'bg-green-500', key: 'videos_bytes' as const },
  { label: 'Models', color: 'bg-yellow-500', key: 'models_bytes' as const },
  { label: 'Other', color: 'bg-gray-500', key: 'other_bytes' as const },
];

export const Stats = () => {
  const { data: stats, isPending, isError } = useCacheStats();

  if (isPending || !stats) {
    return (
      <div className="flex flex-col gap-2 px-2">
        <span className="text-xs text-muted-foreground">…</span>
        <div className="h-2 w-full rounded-full bg-muted" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-2 text-xs text-muted-foreground">
        Cache stats unavailable
      </div>
    );
  }

  const total = totalUsedBytes(stats);

  const segments = rows.map((row) => ({
    value: segmentPercent(stats[row.key], total),
    color: row.color,
  }));

  return (
    <div className="flex flex-col gap-2 px-2">
      <span className="text-xs text-muted-foreground">
        {formatBytes(total)} used
      </span>
      <SegmentedProgress segments={segments} />
      <div className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0 py-0.5 text-xs">
            <div className="flex items-center gap-2">
              <div className={`size-2 shrink-0 rounded-full ${row.color}`} />
              <span className="flex-1">{row.label}</span>
              <span className="text-muted-foreground">
                {formatBytes(stats[row.key])}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
