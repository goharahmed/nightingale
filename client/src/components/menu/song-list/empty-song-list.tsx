import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useFolderActions } from '@/hooks/use-folder-actions';
import { MusicIcon } from 'lucide-react';

export const EmptySongList = () => {
  const { selectFolder } = useFolderActions();

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MusicIcon />
        </EmptyMedia>
        <EmptyTitle>Folder not selected</EmptyTitle>
        <EmptyDescription>
          You haven't selected folder yet.
          <br /> Select a folder to start enjoying your karaoke!
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <Button variant="outline" onClick={selectFolder}>
          Select Folder
        </Button>
      </EmptyContent>
    </Empty>
  );
};
