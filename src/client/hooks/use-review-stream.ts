import { diffQueryOptions } from "@client/queries/diff";
import { reviewQueryOptions } from "@client/queries/review";
import { useEffect } from "react";

import { queryClient } from "../lib/query-client";

// `["pending"]` is a prefix key, so both ranges invalidate at once.
const LIVE_KEYS = [
  diffQueryOptions.queryKey,
  ["pending"] as const,
  reviewQueryOptions.queryKey,
];

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
