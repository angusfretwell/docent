/**
 * The Diff view's mark-as-viewed overlay (diff-review.md §3): an optimistic
 * per-file override so the viewed button responds instantly, ahead of the
 * watch → SSE → re-fetch round trip that folds a toggle into the Review's
 * viewed events. The overlay is deliberately local state rather than a patch
 * of the `["review"]` cache: the server's fold (`computeViewed` over
 * append-only events) is the source of truth, and the SSE-driven snapshot
 * re-fetch delivers it unmodified. The underlying fold
 * (`computeViewed`/`viewedStateFor`) stays in `lib/viewed.ts`.
 */

import { api } from "@client/api";
import type { DiffFile } from "@client/lib/diff";
import type { ViewedModel } from "@client/lib/viewed";
import { viewedStateFor } from "@client/lib/viewed";
import type { ViewedEvent } from "@shared/schemas/review";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

interface ViewedToggle {
  blobSha: string;
  id: string;
  path: string;
  viewed: boolean;
}

/**
 * Post a mark-as-viewed toggle. The decoded event validates the response (and a
 * non-2xx throws so `onError` rolls back); the overlay drives the button, so the
 * event itself is not consumed.
 */
function postViewed(toggle: ViewedToggle): Promise<ViewedEvent> {
  return api.viewed.toggle({ blobSha: toggle.blobSha, path: toggle.path });
}

export interface Viewed {
  isViewed: (id: string) => boolean;
  toggleViewed: (id: string) => void;
}

/**
 * @param fileById The patch's id→file lookup, for the toggle's blobSha stamp.
 * @param model The viewed fold a lookup falls back to once its overlay entry is stale or absent.
 */
export function useViewedState(
  fileById: ReadonlyMap<string, DiffFile>,
  model: ViewedModel
): Viewed {
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
      // button fall back to the fold rather than lie about a saved toggle.
      setOverlay((prev) => {
        const rolledBack = new Map(prev);
        rolledBack.delete(variables.id);
        return rolledBack;
      });
    },
    onMutate: (variables) => {
      setOverlay((prev) =>
        new Map(prev).set(variables.id, {
          blobSha: variables.blobSha,
          viewed: variables.viewed,
        })
      );
    },
  });

  function isViewed(id: string): boolean {
    const override = overlay.get(id);

    if (
      override !== undefined &&
      override.blobSha === fileById.get(id)?.blobSha
    ) {
      return override.viewed;
    }

    return viewedStateFor(model, id).viewed;
  }

  function toggleViewed(id: string) {
    const file = fileById.get(id);

    if (file === undefined) {
      return;
    }

    toggle.mutate({
      blobSha: file.blobSha,
      id,
      path: file.path,
      viewed: !isViewed(id),
    });
  }

  return { isViewed, toggleViewed };
}
