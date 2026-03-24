import {
  isAppReady,
  onSetupError,
  onSetupProgress,
  triggerSetup,
} from '@/tauri-bridge/setup';
import { useEffect, useMemo, useState } from 'react';
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
import { exit } from '@/tauri-bridge/exit';
import { Progress } from '@/components/ui/progress';
import type { SetupProgress } from '@/types/SetupProgress';
import type { SetupStep } from '@/types/SetupStep';
import logoSrc from '@/assets/images/logo_square.png'

interface ExtendedSetupProgress extends Omit<SetupProgress, 'step'> {
  step: SetupStep | 'init' | 'error';
}

type InitialStepProps = {
  onStart: () => Promise<void>;
};

const InitialStep = ({ onStart }: InitialStepProps) => (
  <>
    <AlertDialogHeader>
      <AlertDialogTitle>Welcome to Nightingale!</AlertDialogTitle>
      <AlertDialogDescription>
        Before you get started,
        we need to install a few dependencies: <code>ffmpeg</code>,{' '}
        <code>uv</code>, <code>python 3.10</code>, Python packages, and{' '}
        <code>CUDA</code> wheels (NVIDIA GPUs only).
      </AlertDialogDescription>
      <AlertDialogDescription>
        This may take a few minutes. You can exit at any time if you'd prefer
        not to continue.
      </AlertDialogDescription>
      <AlertDialogDescription>This only happens once.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => exit()}>Exit</AlertDialogCancel>
      <AlertDialogAction onClick={onStart}>Continue</AlertDialogAction>
    </AlertDialogFooter>
  </>
);

interface LoadStepProps {
  action: string;
  percent: number;
}

const LoadStep = ({ action, percent }: LoadStepProps) => (
  <>
    <AlertDialogHeader>
      <AlertDialogTitle>Setting up Nightingale</AlertDialogTitle>
      <div className="flex flex-col gap-2 w-full">
        <AlertDialogDescription className="w-full">
          {action}
        </AlertDialogDescription>
        <Progress value={percent} />
      </div>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => exit()}>Exit</AlertDialogCancel>
    </AlertDialogFooter>
  </>
);

interface ErrorStepProps {
  error: string;
}

const ErrorStep = ({ error }: ErrorStepProps) => (
  <>
    <AlertDialogHeader>
      <AlertDialogTitle>Something went wrong</AlertDialogTitle>
      <AlertDialogDescription>
        <code>{error}</code>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogAction onClick={() => exit()}>Exit</AlertDialogAction>
    </AlertDialogFooter>
  </>
);

interface FinalStepProps {
  onFinish: () => void;
}

const FinalStep = ({ onFinish }: FinalStepProps) => (
  <>
    <AlertDialogHeader>
      <AlertDialogTitle>You're all set!</AlertDialogTitle>
      <AlertDialogDescription>
        All dependencies have been installed to{' '}
        <code>~/.nightingale/vendor</code>. Nightingale is ready to use.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogAction onClick={onFinish}>Get Started</AlertDialogAction>
    </AlertDialogFooter>
  </>
);

export const Setup = () => {
  const [shouldRunSetup, setShouldRunSetup] = useState(false);
  const [setupProgress, setSetupProgress] = useState<ExtendedSetupProgress>({
    step: 'init',
    percent: 0,
    action: '',
  });

  useEffect(() => {
    // Check, if setup is required
    const checkIsAppReady = async () => {
      return await isAppReady();
    };

    checkIsAppReady().then((isAppReady) => setShouldRunSetup(!isAppReady));

    let unlistenProgress: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;

    onSetupProgress((progress) => {
      setSetupProgress(progress);
    }).then((fn) => {
      unlistenProgress = fn;
    });

    onSetupError((error) => {
      setSetupProgress({ step: 'error', percent: 0, action: error });
    }).then((fn) => {
      unlistenError = fn;
    });

    return () => {
      unlistenProgress?.();
      unlistenError?.();
    };
  }, []);

  const { step, percent, action } = setupProgress;

  const Step = useMemo(() => {
    switch (step) {
      case 'init':
        return () => <InitialStep onStart={triggerSetup} />;
      case 'ffmpeg':
      case 'uv':
      case 'python':
      case 'venv':
      case 'dependencies':
      case 'extractscripts':
        return () => <LoadStep action={action} percent={percent} />;
      case 'finish':
        return () => <FinalStep onFinish={() => setShouldRunSetup(false)} />;
      case 'error':
        return () => <ErrorStep error={action} />;
    }
  }, [step, action, percent]);

  return (
    <AlertDialog open={shouldRunSetup}>
      <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
        <img src={logoSrc} width={80} height={80} />
        <Step />
      </AlertDialogContent>
    </AlertDialog>
  );
};
