import type { Annotation } from "@client/lib/diff-annotations";
import type { CodeViewItem } from "@pierre/diffs";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "./ui/button";

export function CodeViewHeaderPrefix({
  onToggleItemCollapsed,
  item,
}: {
  item: CodeViewItem<Annotation>;
  onToggleItemCollapsed: (itemId: string) => void;
}) {
  if (item.type !== "diff") {
    return null;
  }

  const disabled =
    item.fileDiff.splitLineCount === 0 && item.fileDiff.unifiedLineCount === 0;

  const collapsed = item.collapsed || disabled;

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => onToggleItemCollapsed(item.id)}
      disabled={disabled}
      aria-label={collapsed ? "Expand file" : "Collapse file"}
    >
      {collapsed ? (
        <ChevronRightIcon className="size-4" />
      ) : (
        <ChevronDownIcon className="size-4" />
      )}
    </Button>
  );
}
