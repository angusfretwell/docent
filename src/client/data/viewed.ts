/**
 * The Diff tab's mark-as-viewed overlay (diff-review.md §3): an optimistic
 * per-file override so the checkbox and body-collapse respond instantly, ahead
 * of the watch → SSE → re-fetch round trip that folds a toggle into the
 * Review's viewed events. The overlay is deliberately local state rather than
 * a patch of the `["review"]` cache: the server's fold (`computeViewed` over
 * append-only events) is the source of truth, and the SSE-driven snapshot
 * re-fetch delivers it unmodified. The underlying fold
 * (`computeViewed`/`viewedStateFor`) stays in `lib/viewed.ts`.
 */

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { FileEntry } from "../lib/nav";
import type { ViewedModel } from "../lib/viewed";
import { viewedStateFor } from "../lib/viewed";

interface ViewedToggle {
  entry: FileEntry;
  id: string;
  viewed: boolean;
}

/** Post a mark-as-viewed toggle, throwing on a non-2xx so `onError` rolls back. */
async function postViewed(toggle: ViewedToggle): Promise<void> {
  const { entry } = toggle;
  const res = await fetch("/api/viewed", {
    body: JSON.stringify({ blobSha: entry.blobSha, path: entry.path }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`POST /api/viewed failed: HTTP ${res.status}`);
  }
}

export interface ViewedState {
  isViewed: (id: string) => boolean;
  toggleViewed: (id: string) => void;
}

/**
 * @param entryById The file model's id→entry lookup, for the toggle's blobSha stamp.
 * @param model The viewed fold a lookup falls back to once its overlay entry is stale or absent.
 */
export function useViewedState(
  entryById: ReadonlyMap<string, FileEntry>,
  model: ViewedModel
): ViewedState {
  // Optimistic viewed overrides, keyed by file id and stamped with the head
  // blob the toggle asserted against. Blob-stamping makes the override
  // self-invalidating: once a new Change gives the file a different head blob,
  // the stamp no longer matches and the fold's cleared / changed-since-viewed
  // state shows through — no reconcile pass needed.
  const [overlay, setOverlay] = useState<
    ReadonlyMap<string, { viewed: boolean; blobSha: string }>
  >(new Map());

  const toggle = useMutation({
    mutationFn: postViewed,
    onError: (_error, variables) => {
      // The write failed, so nothing persisted: drop the override and let the
      // checkbox fall back to the fold rather than lie about a saved toggle.
      setOverlay((prev) => {
        const rolledBack = new Map(prev);
        rolledBack.delete(variables.id);
        return rolledBack;
      });
    },
    onMutate: (variables) => {
      setOverlay((prev) =>
        new Map(prev).set(variables.id, {
          blobSha: variables.entry.blobSha,
          viewed: variables.viewed,
        })
      );
    },
  });

  function isViewed(id: string): boolean {
    const override = overlay.get(id);
    if (
      override !== undefined &&
      override.blobSha === entryById.get(id)?.blobSha
    ) {
      return override.viewed;
    }
    return viewedStateFor(model, id).viewed;
  }

  function toggleViewed(id: string) {
    const entry = entryById.get(id);
    if (entry === undefined) {
      return;
    }
    toggle.mutate({ entry, id, viewed: !isViewed(id) });
  }

  return { isViewed, toggleViewed };
}
