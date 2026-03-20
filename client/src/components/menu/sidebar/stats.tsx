import { SegmentedProgress } from '@/components/ui/segmented-progress';

const categories = [
  { label: 'Songs', color: 'bg-blue-500', size: '6.6 MB', value: 0.5 },
  { label: 'Videos', color: 'bg-green-500', size: '354.1 MB', value: 2.6 },
  { label: 'Models', color: 'bg-yellow-500', size: '5.0 GB', value: 37 },
  { label: 'Other', color: 'bg-gray-500', size: '8.2 GB', value: 60.7 },
];

export const Stats = () => (
  <div className="flex flex-col gap-2 px-2">
    <span className="text-xs text-muted-foreground">13.5 GB used</span>
    <SegmentedProgress
      segments={categories.map((cat) => ({
        value: cat.value,
        color: cat.color,
      }))}
    />
    <div className="flex flex-col gap-0.5">
      {categories.map((cat) => (
        <div key={cat.label} className="flex items-center gap-2 py-0.5 text-xs">
          <div className={`size-2 shrink-0 rounded-full ${cat.color}`} />
          <span className="flex-1">{cat.label}</span>
          <span className="text-muted-foreground">{cat.size}</span>
        </div>
      ))}
    </div>
  </div>
);
