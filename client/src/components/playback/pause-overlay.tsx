import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDialogNav } from '@/hooks/navigation/use-dialog-nav';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

interface PauseOverlayProps {
  open: boolean;
  onExit: () => void;
  onContinue: () => void;
}

export const PauseOverlay = ({
  open,
  onExit,
  onContinue,
}: PauseOverlayProps) => {
  const onConfirm = useCallback(
    (index: number) => {
      if (index === 0) {
        onContinue();
      } else {
        onExit();
      }
    },
    [onContinue, onExit],
  );

  const { focusedIndex } = useDialogNav({
    open,
    itemCount: 2,
    onConfirm,
    onBack: onContinue,
  });

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onContinue()}>
      <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Paused</AlertDialogTitle>
          <AlertDialogDescription>
            Exiting now won&apos;t save your progress
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onContinue}
            className={cn(
              'focus-visible:ring-0 focus-visible:border-transparent',
              open &&
                focusedIndex === 0 &&
                'outline-2 outline-primary outline-offset-2',
            )}
          >
            Continue
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={onExit}
            className={cn(
              'focus-visible:ring-0 focus-visible:border-transparent',
              open &&
                focusedIndex === 1 &&
                'outline-2 outline-primary outline-offset-2',
            )}
          >
            Exit to Menu
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
