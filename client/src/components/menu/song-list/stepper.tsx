import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MinusIcon, PlusIcon } from "lucide-react";
import { MouseEvent } from "react";

interface Props {
  disabled?: {
    plus?: boolean;
    minus?: boolean;
  };
  loading?: boolean;
  label?: string | null;
  tooltip?: string;
  onClick?: {
    plus?: () => void;
    minus?: () => void;
  };
}

export const Stepper = ({
  label,
  loading,
  tooltip,
  disabled: { plus: plusDisabled, minus: minusDisabled } = {},
  onClick = {},
}: Props) => {
  const withStopPropagation = (callback?: () => void) => (event: MouseEvent) => {
    event.stopPropagation();

    callback?.();
  };

  return (
    <ButtonGroup orientation="vertical" aria-label="Media controls" className="h-fit self-center">
      <Button
        onClick={withStopPropagation(onClick?.plus)}
        disabled={plusDisabled}
        variant="outline"
        size="icon-xs"
      >
        <PlusIcon />
      </Button>
      {loading ? (
        <span className="flex align-center justify-center py-0.5 text-gray-500 border-1">
          <Spinner className="size-3" />
        </span>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-center py-0.5 text-gray-500 border-1 text-[0.5rem]">
              {label ?? "??"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-48">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
      <Button
        onClick={withStopPropagation(onClick?.minus)}
        disabled={minusDisabled}
        variant="outline"
        size="icon-xs"
      >
        <MinusIcon />
      </Button>
    </ButtonGroup>
  );
};
