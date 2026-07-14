import { ReviewSnapshot } from "@shared/schemas/review";
import { queryOptions } from "@tanstack/react-query";
import { Schema } from "effect";

const decodeSnapshot = Schema.decodeUnknownSync(ReviewSnapshot);

export const reviewQueryOptions = queryOptions({
  queryFn: async ({ signal }) => {
    const res = await fetch("/api/review", { signal });

    if (!res.ok) {
      throw new Error(`GET /api/review failed: HTTP ${res.status}`);
    }

    return decodeSnapshot(await res.json());
  },
  queryKey: ["review"],
});
