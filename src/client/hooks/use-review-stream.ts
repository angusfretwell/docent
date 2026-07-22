import { api } from "@client/api";
import { diffQueryOptions } from "@client/queries/diff";
import { pendingQueryKey } from "@client/queries/pending";
import { reviewQueryOptions } from "@client/queries/review";
import { useEffect } from "react";

import { queryClient } from "../lib/query-client";

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
