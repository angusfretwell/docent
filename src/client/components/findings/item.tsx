import { cn } from "@client/lib/utils";
import { STATUS_LABEL } from "@shared/lib/finding";
import type { FoldedFinding, Status } from "@shared/lib/finding";
import type { DriftState } from "@shared/schemas/drift";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Badge } from "../ui/badge";
import type { BadgeProps } from "../ui/badge";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { FindingDiffLink } from "./diff-link";
import type { FindingSection } from "./section-link";
import { FindingSectionLink } from "./section-link";
import { FindingThread } from "./thread";

export const STATUS_VARIANT: Record<Status, BadgeProps["variant"]> = {
  actioned: "warning",
  open: "info",
  resolved: "success",
};

export function FindingsItem({
  finding,
  diffItemId,
  drift,
  location,
  section,
}: {
  finding: FoldedFinding;
  diffItemId?: string;
  drift?: DriftState;
  location: string;
  section?: FindingSection;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="-mt-px">
      <CollapsibleTrigger
        className={cn(
          "sticky -top-px w-full gap-1 flex cursor-pointer px-2 h-10 items-center group hover:bg-sidebar z-10",
          "before:absolute before:top-0 before:left-0 before:w-full before:h-px before:content-[''] before:bg-border",
          open &&
            "after:absolute after:-bottom-px after:left-0 after:w-full after:h-px after:content-[''] after:bg-border",
          open && "bg-sidebar"
        )}
      >
        {open ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}

        <span className="truncate text-[13px]">{location}</span>

        {/* TODO: merge these two into a single FindingLink component */}
        <FindingDiffLink diffItemId={diffItemId} />
        <FindingSectionLink section={section} />

        <div className="flex items-center gap-1 ml-auto">
          {finding.status !== "open" && (
            <Badge variant={STATUS_VARIANT[finding.status]} size="sm">
              {STATUS_LABEL[finding.status]}
            </Badge>
          )}

          {drift === "outdated" && (
            <Badge variant="secondary" size="sm">
              Outdated
            </Badge>
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsiblePanel className="transition-none">
        <div className="p-3 py-4">
          <FindingThread finding={finding} />
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
