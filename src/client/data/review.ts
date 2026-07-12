/**
 * The Diff tab's live data loop as queries: the Change, the Pending preview
 * (at a given range), and the Review snapshot, each decoded to its domain type
 * inside the `queryFn` so the cache holds `Change`/`Pending`/`ReviewSnapshot`,
 * never raw JSON. Freshness is event-driven: `useReviewStream` holds the one
 * SSE connection and invalidates exactly these keys on `review-changed`
 * (architecture.md §2) — an agent editing the working tree pushes a coarse
 * event and Pending refreshes live.
 */

import { Change, DiffError } from "@shared/schemas/change";
import type { PendingRange } from "@shared/schemas/pending";
import { Pending } from "@shared/schemas/pending";
import { ReviewSnapshot } from "@shared/schemas/review";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { Schema } from "effect";
import { useEffect } from "react";

import { queryClient } from "./query-client";

// Sync decode boundary: each queryFn owns the throw and Query catches it.
const decodeChange = Schema.decodeUnknownSync(Change);
const decodeDiffError = Schema.decodeUnknownSync(DiffError);
const decodeSnapshot = Schema.decodeUnknownSync(ReviewSnapshot);
const decodePending = Schema.decodeUnknownSync(Pending);

function failureMessage(body: unknown, status: number): string {
  try {
    return decodeDiffError(body).error;
  } catch {
    return `HTTP ${status}`;
  }
}

const diffQuery = queryOptions({
  queryFn: async ({ signal }) => {
    const res = await fetch("/api/diff", { signal });
    const body: unknown = await res.json();
    if (!res.ok) {
      throw new Error(failureMessage(body, res.status));
    }
    return decodeChange(body);
  },
  queryKey: ["diff"],
});

function pendingQuery(range: PendingRange) {
  return queryOptions({
    // The previous range's diff stands in while the toggled range loads, so
    // the incremental/cumulative switch never flashes an empty preview.
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/pending?range=${range}`, { signal });
      if (!res.ok) {
        throw new Error(`GET /api/pending failed: HTTP ${res.status}`);
      }
      return decodePending(await res.json());
    },
    queryKey: ["pending", range],
  });
}

const reviewQuery = queryOptions({
  queryFn: async ({ signal }) => {
    const res = await fetch("/api/review", { signal });
    if (!res.ok) {
      throw new Error(`GET /api/review failed: HTTP ${res.status}`);
    }
    return decodeSnapshot(await res.json());
  },
  queryKey: ["review"],
});

// The keys `review-changed` touches. `["pending"]` is a prefix, so both
// ranges invalidate at once; blob keys are content-addressed and never listed.
const LIVE_KEYS = [
  diffQuery.queryKey,
  ["pending"] as const,
  reviewQuery.queryKey,
];

/**
 * The watch → SSE → re-fetch loop: one `EventSource` for the app's lifetime
 * (opened on mount, never at import time, so tests open no sockets) whose
 * `review-changed` handler invalidates the three live keys — Query then
 * re-fetches whichever are mounted, `staleTime: Infinity` notwithstanding.
 */
export function useReviewStream(): void {
  useEffect(() => {
    const events = new EventSource("/api/events");
    function invalidateLiveQueries() {
      for (const queryKey of LIVE_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
    }
    events.addEventListener("review-changed", invalidateLiveQueries);
    return () => {
      events.close();
    };
  }, []);
}

export type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; change: Change };

/**
 * The committed Change's tri-state, with the error surfacing over any cached
 * data: the pre-Query loop replaced a loaded Change with the error message
 * when a re-fetch failed, and the UI keeps that contract.
 */
function changeLoadState(diff: UseQueryResult<Change>): LoadState {
  if (diff.error !== null) {
    return { kind: "error", message: diff.error.message };
  }
  if (diff.data !== undefined) {
    return { change: diff.data, kind: "loaded" };
  }
  return { kind: "loading" };
}

export interface ReviewData {
  change: LoadState;
  pending: Pending | null;
  review: ReviewSnapshot | null;
}

/**
 * The Change, the Pending preview, and the Review snapshot, kept live off the
 * `.docent/` watch's SSE stream via `useReviewStream`'s invalidations. Pending
 * and the snapshot are best-effort: a failed fetch keeps the last good value
 * (Query retains `data` alongside the error), so a transient error never
 * blanks the preview or the Review fold.
 *
 * @param range Which Pending diff to load — incremental or cumulative.
 */
export function useReviewData(range: PendingRange): ReviewData {
  const diff = useQuery(diffQuery);
  const pending = useQuery(pendingQuery(range));
  const review = useQuery(reviewQuery);

  return {
    change: changeLoadState(diff),
    pending: pending.data ?? null,
    review: review.data ?? null,
  };
}
