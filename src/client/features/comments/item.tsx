import { Badge } from "@client/components/ui/badge";
import type { BadgeProps } from "@client/components/ui/badge";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@client/components/ui/collapsible";
import { useRevealSection } from "@client/features/walkthrough/hooks/use-revealed-section";
import { useDrawerDismiss } from "@client/hooks/use-drawer-dismiss";
import { useRevealDiffItem } from "@client/lib/diff-target";
import { cn } from "@client/lib/utils";
import { STATUS_LABEL } from "@shared/enums/comment-status";
import type { CommentStatus } from "@shared/enums/comment-status";
import type { DriftState } from "@shared/enums/drift-state";
import type { FoldedComment } from "@shared/lib/comment";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  GitCompare,
  Pointer,
} from "lucide-react";
import { useState } from "react";

import type { CommentSection } from "./lib/types";
import { CommentLink } from "./link";
import { CommentThread } from "./thread";

export const STATUS_VARIANT: Record<CommentStatus, BadgeProps["variant"]> = {
  actioned: "warning",
  open: "info",
  resolved: "success",
};

export function CommentsItem({
  comment,
  diffItemId,
  drift,
  location,
  section,
}: {
  comment: FoldedComment;
  diffItemId?: string;
  drift?: DriftState;
  location: string;
  section?: CommentSection;
}) {
  const [open, setOpen] = useState(true);

  const revealDiffItem = useRevealDiffItem();
  const revealSection = useRevealSection();
  const dismissDrawer = useDrawerDismiss();

  const isCodeSection = section?.pillar === "code";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="-mt-px">
      <CollapsibleTrigger
        className={cn(
          "group sticky -top-px z-10 flex h-10 w-full cursor-pointer items-center gap-1 px-2 hover:bg-sidebar",
          "before:absolute before:top-0 before:left-0 before:h-px before:w-full before:bg-border before:content-['']",
          open &&
            "after:absolute after:-bottom-px after:left-0 after:h-px after:w-full after:bg-border after:content-['']",
          open && "bg-sidebar"
        )}
      >
        {open ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}

        <span className="min-w-0 truncate text-[13px]">{location}</span>

        {diffItemId === undefined ? null : (
          <CommentLink
            icon={<GitCompare />}
            label="Show in diff"
            onReveal={() => {
              revealDiffItem(diffItemId);
              dismissDrawer();
            }}
            to="/"
          />
        )}

        {section === undefined ? null : (
          <CommentLink
            icon={isCodeSection ? <Code2 /> : <Pointer />}
            label={`Show in ${isCodeSection ? "code" : "product"} walkthrough`}
            onReveal={() => {
              revealSection(section.key);
              dismissDrawer();
            }}
            to={isCodeSection ? "/code" : "/product"}
          />
        )}

        <div className="ml-auto flex items-center gap-1">
          {comment.status !== "open" && (
            <Badge variant={STATUS_VARIANT[comment.status]} size="sm">
              {STATUS_LABEL[comment.status]}
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
          <CommentThread comment={comment} />
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
