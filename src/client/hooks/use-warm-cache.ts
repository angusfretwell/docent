import { diffQueryOptions } from "@client/queries/diff";
import { pendingQueryOptions } from "@client/queries/pending";
import { reviewQueryOptions } from "@client/queries/review";
import { PendingRange } from "@shared/enums/pending-range";
import { usePrefetchQuery } from "@tanstack/react-query";

// Pending is read only on `/`; warming it here keeps arriving at `/` from another route from suspending on a cold fetch.
export function useWarmCache(): void {
  usePrefetchQuery(diffQueryOptions);
  usePrefetchQuery(reviewQueryOptions);
  usePrefetchQuery(pendingQueryOptions(PendingRange.Incremental));
}
