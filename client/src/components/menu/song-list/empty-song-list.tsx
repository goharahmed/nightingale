import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { SONGS } from '@/queries/keys';
import { selectFolder } from '@/tauri-bridge/folder';
import { useQueryClient } from '@tanstack/react-query';
import { MusicIcon } from 'lucide-react';

export const EmptySongList = () => {
  const queryClient = useQueryClient();

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
        <Button
          variant="outline"
          onClick={async () => {
            await selectFolder();

            queryClient.invalidateQueries({ queryKey: SONGS });
          }}
        >
          Select Folder
        </Button>
      </EmptyContent>
    </Empty>
  );
};
