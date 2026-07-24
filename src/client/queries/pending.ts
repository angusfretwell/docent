import { api } from "@client/api";
import type { PendingRange } from "@shared/enums/pending-range";
import { queryOptions } from "@tanstack/react-query";

/** Prefix key covering every range, so one invalidation refreshes both. */
export const pendingQueryKey = ["pending"] as const;

export function pendingQueryOptions(range: PendingRange) {
  return queryOptions({
    queryFn: ({ signal }) => api.pending.get(range, signal),
    queryKey: [...pendingQueryKey, range],
  });
}
