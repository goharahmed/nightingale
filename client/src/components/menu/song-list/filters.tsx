import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAnalysis } from '@/hooks/use-analysis';
import { useSearch } from '@/hooks/use-search';
import { useRef } from 'react';

const DEBOUNCE_MS = 500;

export const Filters = () => {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { setSearch } = useSearch();
  const { enqueueAll } = useAnalysis();

  const handleChange = (value: string) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSearch(value), DEBOUNCE_MS);
  };

  return (
    <div className="flex w-full items-center gap-4">
      <Input
        onChange={({ target: { value } }) => handleChange(value)}
        className="flex-1"
        placeholder="Type to search songs..."
      />
      <Button variant="outline" onClick={enqueueAll}>
        Analyze All
      </Button>
    </div>
  );
};
