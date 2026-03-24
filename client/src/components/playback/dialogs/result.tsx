import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ScoreRecord } from '@/types/ScoreRecord';
import type { Song } from '@/types/Song';
import { cn } from '@/lib/utils';
import { topScoresForSong } from '@/utils/playback/result';
import { Stars } from '@/components/shared/stars';

const TOP_LIMIT = 5;

interface Props {
  open: boolean;
  score: number;
  song: Song;
  scores: ScoreRecord[];
  activeProfile: string | null;
  onFinish: () => void;
}

export const ResultDialog = ({
  open,
  score,
  onFinish,
  song,
  scores,
  activeProfile,
}: Props) => {
  const board = topScoresForSong(scores, song.file_hash, TOP_LIMIT);

  return (
    <Dialog open={open} modal>
      <DialogContent
        showCloseButton={false}
        className="p-0 sm:max-w-sm"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-col gap-4 p-7">
          <DialogHeader className="gap-1 text-center sm:text-center">
            <DialogTitle className="text-xl font-semibold">{song.title}</DialogTitle>
            <DialogDescription className="text-sm">{song.artist}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-1">
            <p
              className="text-4xl font-semibold text-primary tabular-nums"
              aria-label={`Score ${score}`}
            >
              {score}
            </p>
            <Stars score={score} size="lg" className="mt-1" />
          </div>

          {board.length > 0 ? (
            <>
              <div className="h-px w-full bg-border" />
              <p className="text-center text-[11px] font-medium tracking-wide text-muted-foreground">
                BEST SCORES
              </p>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 text-xs">#</TableHead>
                    <TableHead className="h-8 text-xs">Profile</TableHead>
                    <TableHead className="h-8 text-right text-xs">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {board.map(({ profile, score: rowScore }, i) => {
                    const isCurrent =
                      profile === activeProfile && rowScore === score;

                    return (
                      <TableRow
                        key={profile}
                        className={cn(
                          isCurrent && 'bg-primary/10',
                        )}
                      >
                        <TableCell className="py-2 text-xs tabular-nums">
                          {i + 1}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'py-2 text-xs',
                            isCurrent && 'font-medium text-primary',
                          )}
                        >
                          {profile}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'py-2 text-right text-xs tabular-nums',
                            isCurrent && 'font-medium text-primary',
                          )}
                        >
                          {rowScore}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          ) : null}

          <DialogFooter className="mt-2 sm:justify-center">
            <Button type="button" className="w-full sm:w-auto" onClick={onFinish}>
              Back to Menu
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
