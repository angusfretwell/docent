import { Button } from "@client/components/ui/button";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@client/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * The affordance a finding wears to reach where it is anchored — the diff hunk,
 * or the tour step it was opened against. The icon and destination differ; the
 * structure (a hover-revealed ghost button that navigates and reveals without
 * toggling the surrounding row) is identical, so it lives here once.
 */
export function FindingLink({
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
