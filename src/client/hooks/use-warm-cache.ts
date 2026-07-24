import { diffQueryOptions } from "@client/queries/diff";
import { pendingQueryOptions } from "@client/queries/pending";
import { reviewQueryOptions } from "@client/queries/review";
import { PendingRange } from "@shared/enums/pending-range";
import { usePrefetchQuery } from "@tanstack/react-query";

/**
 * Warms every route's data on mount so navigation never lands on a cold query.
 * The chrome already reads diff and review, but pending is read only on `/` —
 * without warming it here, arriving at `/` from another route would suspend on
 * its first fetch. Pending warms at the default landing range; toggling to the
 * other range is covered by the navigation transition.
 */
export function useWarmCache(): void {
  usePrefetchQuery(diffQueryOptions);
  usePrefetchQuery(reviewQueryOptions);
  usePrefetchQuery(pendingQueryOptions(PendingRange.Incremental));
}
