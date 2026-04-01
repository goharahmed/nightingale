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
  const valueCellClassName = "grid h-5 place-items-center border border-gray-200 text-gray-500";

  const withStopPropagation = (callback?: () => void) => (event: MouseEvent) => {
    event.stopPropagation();

    callback?.();
  };

  const renderButton = (direction: "plus" | "minus") => {
    const Icon = direction === "plus" ? PlusIcon : MinusIcon;
    const isDisabled = direction === "plus" ? plusDisabled : minusDisabled;
    const handler = direction === "plus" ? onClick?.plus : onClick?.minus;

    return (
      <Button
        onClick={withStopPropagation(handler)}
        disabled={isDisabled}
        variant="outline"
        size="icon-xs"
      >
        <Icon />
      </Button>
    );
  };

  return (
    <ButtonGroup orientation="vertical" aria-label="Media controls" className="h-fit self-center">
      {renderButton("plus")}
      {loading ? (
        <span className={valueCellClassName}>
          <Spinner className="size-2.5 will-change-transform" />
        </span>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`${valueCellClassName} text-center text-[0.5rem] leading-none`}>
              {label ?? "??"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-48">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
      {renderButton("minus")}
    </ButtonGroup>
  );
};
