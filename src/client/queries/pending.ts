import { api } from "@client/api";
import type { PendingRange } from "@shared/enums/pending-range";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

/** Prefix key covering every range, so one invalidation refreshes both. */
export const pendingQueryKey = ["pending"] as const;

export function pendingQueryOptions(range: PendingRange) {
  return queryOptions({
    // The previous range's diff stands in while the toggled range loads, so
    // the incremental/cumulative switch never flashes an empty preview.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.pending.get(range, signal),
    queryKey: [...pendingQueryKey, range],
  });
}
