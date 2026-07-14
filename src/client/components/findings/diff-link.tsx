import { useRevealDiffItem } from "@client/lib/diff-target";
import { Link } from "@tanstack/react-router";
import { GitCompare } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function FindingDiffLink({ diffItemId }: { diffItemId?: string }) {
  const revealDiffItem = useRevealDiffItem();

  if (!diffItemId) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            className="opacity-0 group-hover:opacity-100 "
            onClick={(event) => {
              event.stopPropagation();
              revealDiffItem(diffItemId);
            }}
            render={<Link to="/" />}
          >
            <GitCompare />
          </Button>
        }
      />

      <TooltipPopup>Show in diff</TooltipPopup>
    </Tooltip>
  );
}
