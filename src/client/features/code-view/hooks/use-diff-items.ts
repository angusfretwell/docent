import type { DiffFile } from "@client/lib/diff";
import { diffItemVersion } from "@client/lib/diff";
import type { Annotation, Composing } from "@client/lib/diff-annotations";
import { annotationsKey, itemAnnotations } from "@client/lib/diff-annotations";
import type { DriftResult } from "@client/lib/drift";
import type { CodeViewItem } from "@pierre/diffs";
import type { FoldedFinding } from "@shared/lib/finding";

export function useDiffItems({
  composing,
  driftFor,
  files,
  findings,
  isCollapsed = () => false,
}: {
  composing: Composing | null;
  driftFor?: (id: string) => DriftResult | undefined;
  files: DiffFile[];
  findings: readonly FoldedFinding[];
  isCollapsed?: (itemId: string) => boolean;
}): CodeViewItem<Annotation>[] {
  return files.map((entry) => {
    const collapsed = isCollapsed(entry.id);
    const annotations = itemAnnotations({
      composing,
      driftFor,
      fileDiff: entry.file,
      findings,
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
