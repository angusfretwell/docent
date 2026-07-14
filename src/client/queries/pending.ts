import type { PendingRange } from "@shared/schemas/pending";
import { Pending } from "@shared/schemas/pending";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { Schema } from "effect";

const decodePending = Schema.decodeUnknownSync(Pending);

export function pendingQueryOptions(range: PendingRange) {
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
