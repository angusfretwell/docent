/**
 * Lazy context expansion for the Diff tab (diff-review.md §4): a patch-only
 * file is `isPartial`, so the renderer hides its own hunk-expansion controls.
 * On "Expand context" this fetches the file's full base/head blobs and swaps
 * in the non-partial diff — only then does the renderer expose hunk/whole-file
 * expansion. Fetching is per-file and on demand, never eager. Factored out of
 * `diff-view.tsx` so the fetch/busy lifecycle is legible on its own.
 */

import type { FileDiffMetadata } from "@pierre/diffs";
import { useState } from "react";

export interface ContextExpansion {
  /**
   * Files whose full base/head blobs have been fetched, keyed by item id — a
   * present entry is a non-partial diff the renderer can expand.
   */
  expanded: ReadonlyMap<string, FileDiffMetadata>;
  /** Ids with a fetch in flight, so the affordance can't double-fire. */
  expanding: ReadonlySet<string>;
  expandContext: (id: string, fileDiff: FileDiffMetadata) => void;
}

/** @param expandFile Fetches a file's full base/head blobs and re-parses its diff. */
export function useContextExpansion(
  expandFile: (fileDiff: FileDiffMetadata) => Promise<FileDiffMetadata>
): ContextExpansion {
  const [expanded, setExpanded] = useState<
    ReadonlyMap<string, FileDiffMetadata>
  >(new Map());
  const [expanding, setExpanding] = useState<ReadonlySet<string>>(new Set());

  function expandContext(id: string, fileDiff: FileDiffMetadata) {
    setExpanding((prev) => new Set(prev).add(id));
    void expandFile(fileDiff)
      .then((full) => {
        setExpanded((prev) => new Map(prev).set(id, full));
      })
      .catch(() => {
        // Best-effort: leave the file partial on a failed blob fetch.
      })
      .finally(() => {
        setExpanding((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  }

  return { expandContext, expanded, expanding };
}
