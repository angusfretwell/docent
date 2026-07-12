/**
 * The app's single QueryClient. Freshness is event-driven, not time-driven:
 * every query is fresh forever (`staleTime: Infinity`) and the SSE bridge in
 * `review.ts` explicitly invalidates the live keys on each `review-changed`
 * event (architecture.md §2). Content-addressed blob queries are never
 * invalidated at all — a sha names its bytes forever. `retry: false` keeps
 * the pre-Query behavior: one attempt per fetch, then last-good or error.
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { retry: false },
    queries: { retry: false, staleTime: Infinity },
  },
});
