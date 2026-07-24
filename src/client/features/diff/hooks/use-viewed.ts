/**
 * An optimistic per-file viewed override, local state ahead of the SSE re-fetch
 * that folds the toggle server-side — which stays the source of truth.
 *
 * @see diff-review.md §3
 */

import { api } from "@client/api";
import type { DiffFile } from "@client/lib/diff";
import type { ViewedEvent } from "@shared/schemas/review";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { ViewedModel } from "../lib/viewed";
import { viewedStateFor } from "../lib/viewed";

interface ViewedToggle {
  blobSha: string;
  id: string;
  path: string;
  viewed: boolean;
}

/**
 * The decoded event validates the response (a non-2xx throws so `onError` rolls
 * back); the overlay drives the button, so the event itself is not consumed.
 */
function postViewed(toggle: ViewedToggle): Promise<ViewedEvent> {
  return api.viewed.toggle({ blobSha: toggle.blobSha, path: toggle.path });
}

export interface Viewed {
  isViewed: (id: string) => boolean;
  toggleViewed: (id: string) => void;
}

export function useViewedState(
  fileById: ReadonlyMap<string, DiffFile>,
  model: ViewedModel
): Viewed {
  // Stamped with the head blob so the override self-invalidates: once a new
  // Change gives the file a different blob, the stamp no longer matches and the
  // fold shows through — no reconcile pass needed.
  const [overlay, setOverlay] = useState<
    ReadonlyMap<string, { viewed: boolean; blobSha: string }>
  >(new Map());

  const toggle = useMutation({
    mutationFn: postViewed,
    onError: (_error, variables) => {
      // The write failed, so nothing persisted: drop the override and fall back
      // to the fold rather than lie about a saved toggle.
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
