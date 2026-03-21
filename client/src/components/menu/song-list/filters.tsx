import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAnalysis } from '@/hooks/use-analysis';
import { useSearch } from '@/hooks/use-search';

export const Filters = () => {
  const { setSearch } = useSearch();
  const { enqueueAll } = useAnalysis();

  return (
    <div className="flex w-full items-center gap-4">
      <Input
        onChange={({ target: { value } }) => setSearch(value)}
        className="flex-1"
        placeholder="Type to search songs..."
      />
      <Button variant="outline" onClick={enqueueAll}>
        Analyze All
      </Button>
    </div>
  );
};
