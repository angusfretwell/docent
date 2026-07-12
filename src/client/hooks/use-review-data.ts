/**
 * The Diff tab's live data loop, factored out of `app.tsx`: one fetch of the
 * Change, the Pending preview (at the given range), and the Review snapshot,
 * then a re-fetch of all three on every SSE `review-changed` event — an agent
 * editing the working tree pushes a coarse event and Pending refreshes live
 * (architecture.md §2). Re-runs when `range` changes, which reloads Pending for
 * the new range. Keeping this here lets `App` stay about layout and tab
 * selection.
 */

import { Change, DiffError } from "@shared/schemas/change";
import type { PendingRange } from "@shared/schemas/pending";
import { Pending } from "@shared/schemas/pending";
import { ReviewSnapshot } from "@shared/schemas/review";
import { Schema } from "effect";
import { useEffect, useState } from "react";

// Sync decode boundary: the fetch handlers below own the try/catch.
const decodeChange = Schema.decodeUnknownSync(Change);
const decodeDiffError = Schema.decodeUnknownSync(DiffError);
const decodeSnapshot = Schema.decodeUnknownSync(ReviewSnapshot);
const decodePending = Schema.decodeUnknownSync(Pending);

export type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; change: Change };

function failureMessage(body: unknown, status: number): string {
  try {
    return decodeDiffError(body).error;
  } catch {
    return `HTTP ${status}`;
  }
}

export interface ReviewData {
  change: LoadState;
  pending: Pending | null;
  review: ReviewSnapshot | null;
}

/**
 * Fetch the Change, the Pending preview, and the Review snapshot once, then
 * keep them live off the `.docent/` watch's SSE stream.
 *
 * @param range Which Pending diff to load — incremental or cumulative.
 */
export function useReviewData(range: PendingRange): ReviewData {
  const [change, setChange] = useState<LoadState>({ kind: "loading" });
  const [pending, setPending] = useState<Pending | null>(null);
  const [review, setReview] = useState<ReviewSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadChange() {
      try {
        const res = await fetch("/api/diff");
        const body: unknown = await res.json();
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          throw new Error(failureMessage(body, res.status));
        }
        // oxlint-disable-next-line react-compiler
        setChange({ change: decodeChange(body), kind: "loaded" });
      } catch (error) {
        if (!cancelled) {
          // oxlint-disable-next-line react-compiler
          setChange({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    // Best-effort read: on any failure keep the last good value until the next
    // event, so a transient error never blanks the Pending preview or review.
    async function loadBestEffort<T>(
      url: string,
      decode: (value: unknown) => T,
      apply: (value: T) => void
    ) {
      try {
        const res = await fetch(url);
        if (res.ok && !cancelled) {
          apply(decode(await res.json()));
        }
      } catch {
        // Ignored by design (see above).
      }
    }
    function loadPending() {
      // oxlint-disable-next-line react-compiler
      return loadBestEffort(
        `/api/pending?range=${range}`,
        decodePending,
        setPending
      );
    }
    function loadReview() {
      // oxlint-disable-next-line react-compiler
      return loadBestEffort("/api/review", decodeSnapshot, setReview);
    }
    function refetchAll() {
      void loadChange();
      void loadPending();
      void loadReview();
    }
    // oxlint-disable-next-line react-doctor/query-no-query-in-effect
    refetchAll();
    const events = new EventSource("/api/events");
    events.addEventListener("review-changed", refetchAll);
    return () => {
      cancelled = true;
      events.close();
    };
  }, [range]);

  return { change, pending, review };
}
