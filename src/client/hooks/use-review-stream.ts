import { api } from "@client/api";
import { pendingQueryKey } from "@client/features/diff/pending";
import { queryClient } from "@client/lib/query-client";
import { diffQueryOptions } from "@client/queries/diff";
import { reviewQueryOptions } from "@client/queries/review";
import { useEffect } from "react";

// `pendingQueryKey` is a prefix, so both ranges invalidate at once.
const LIVE_KEYS = [
  diffQueryOptions.queryKey,
  pendingQueryKey,
  reviewQueryOptions.queryKey,
];

export function useReviewStream(): void {
  useEffect(
    () =>
      api.events.subscribe(() => {
        for (const queryKey of LIVE_KEYS) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }),
    []
  );
}
