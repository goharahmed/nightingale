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

interface PauseOverlayProps {
  open: boolean;
  onExit: () => void;
  onContinue: () => void;
}

export const PauseOverlay = ({
  open,
  onExit,
  onContinue,
}: PauseOverlayProps) => (
  <AlertDialog open={open} onOpenChange={(v) => !v && onContinue()}>
    <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
      <AlertDialogHeader>
        <AlertDialogTitle>Paused</AlertDialogTitle>
        <AlertDialogDescription>
          Exiting now won&apos;t save your progress
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onContinue}>Continue</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onExit}>
          Exit to Menu
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
