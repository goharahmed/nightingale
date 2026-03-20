import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const Filters = () => {
  return (
    <div className="flex w-full items-center gap-4">
      <Input className="flex-1" placeholder="Type to search songs..." />
      <Button variant="outline">Analyze All</Button>
    </div>
  );
};
