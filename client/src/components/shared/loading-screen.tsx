import { Spinner } from '@/components/ui/spinner';

export const LoadingScreen = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-background">
    <Spinner className="size-24 text-muted-foreground" />
  </div>
);
