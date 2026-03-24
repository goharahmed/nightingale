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
import { useDialog } from '@/hooks/use-dialog';
import { exit } from '@/tauri-bridge/exit';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

export const ExitDialog = () => {
  const { close, mode } = useDialog();

  const open = mode === 'exit';

  const onConfirm = useCallback(
    (index: number) => {
      if (index === 0) {
        close();
      } else {
        exit();
      }
    },
    [close],
  );

  const { focusedIndex } = useDialogNav({
    open,
    itemCount: 2,
    onConfirm,
    onBack: close,
  });

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Exit</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to quit?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={close}
            className={cn(
              'focus-visible:ring-0 focus-visible:border-transparent',
              open &&
                focusedIndex === 0 &&
                'outline-2 outline-primary outline-offset-2',
            )}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => exit()}
            className={cn(
              'focus-visible:ring-0 focus-visible:border-transparent',
              open &&
                focusedIndex === 1 &&
                'outline-2 outline-primary outline-offset-2',
            )}
          >
            Exit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
