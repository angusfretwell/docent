import type { DiffFile } from "@client/lib/diff";
import { diffItemVersion } from "@client/lib/diff";
import type { LineDecoration, Composing } from "@client/lib/diff-annotations";
import { annotationsKey, itemAnnotations } from "@client/lib/diff-annotations";
import type { DriftResult } from "@client/lib/drift";
import type { CodeViewItem } from "@pierre/diffs";
import type { FoldedComment } from "@shared/lib/comment";

export function useDiffItems({
  composing,
  driftFor,
  files,
  comments,
  isCollapsed = () => false,
}: {
  composing: Composing | null;
  driftFor?: (id: string) => DriftResult | undefined;
  files: DiffFile[];
  comments: readonly FoldedComment[];
  isCollapsed?: (itemId: string) => boolean;
}): CodeViewItem<LineDecoration>[] {
  return files.map((entry) => {
    const collapsed = isCollapsed(entry.id);
    const annotations = itemAnnotations({
      comments,
      composing,
      driftFor,
      fileDiff: entry.file,
      itemId: entry.id,
    });

    return {
      annotations,
      collapsed,
      fileDiff: entry.file,
      id: entry.id,
      type: "diff",
      version: diffItemVersion(entry, collapsed, annotationsKey(annotations)),
    };
  });
}
