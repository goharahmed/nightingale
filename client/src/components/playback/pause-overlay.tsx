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

const RING = 'ring-2 ring-primary';
const NO_FOCUS_RING = 'focus-visible:ring-0 focus-visible:border-transparent';

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
              NO_FOCUS_RING,
              open && focusedIndex === 0 && RING,
            )}
          >
            Continue
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={onExit}
            className={cn(
              NO_FOCUS_RING,
              open && focusedIndex === 1 && RING,
            )}
          >
            Exit to Menu
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
