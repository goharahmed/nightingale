import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { CogIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export const Setup = () => (
  <div className="flex justify-center items-center h-screen">
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CogIcon />
        </EmptyMedia>
        <EmptyTitle>TODO: PNG</EmptyTitle>
        <EmptyDescription>TODO: Dynamic text</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-column gap-4">
        {/* TODO: Provide actual values */}
        <Progress value={75} max={100} />
        <Button>Quit</Button>
      </EmptyContent>
    </Empty>
  </div>
);
