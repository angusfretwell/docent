import { Button } from "@client/components/ui/button";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@client/components/ui/tooltip";
import { useRevealSection } from "@client/features/walkthrough/target";
import { Link } from "@tanstack/react-router";
import { Code2, Pointer } from "lucide-react";

import type { FindingSection } from "./types";

/**
 * The section counterpart of `FindingDiffLink`: the same affordance a code
 * finding has for reaching its hunk, pointed at the step of the tour the thread
 * was opened against. It wears the pillar's own icon, since where it lands is
 * the thing that differs — a finding on a code tour and one on a product tour
 * are the same kind of thread read in two different places.
 */
export function FindingSectionLink({ section }: { section?: FindingSection }) {
  const revealSection = useRevealSection();

  if (section === undefined) {
    return null;
  }

  const code = section.pillar === "code";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            className="opacity-0 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              revealSection(section.key);
            }}
            render={<Link to={code ? "/code" : "/product"} />}
          >
            {code ? <Code2 /> : <Pointer />}
          </Button>
        }
      />

      <TooltipPopup>
        Show in {code ? "code" : "product"} walkthrough
      </TooltipPopup>
    </Tooltip>
  );
}
