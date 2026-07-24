import { Button } from "@client/components/ui/button";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@client/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function CommentLink({
  icon,
  label,
  onReveal,
  to,
}: {
  icon: ReactNode;
  label: string;
  onReveal: () => void;
  to: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            size="icon-xs"
            variant="ghost"
            className="opacity-0 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onReveal();
            }}
            render={<Link to={to} />}
          >
            {icon}
          </Button>
        }
      />

      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}
