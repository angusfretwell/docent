import { api } from "@client/api";
import type { WalkthroughId } from "@shared/schemas/ids";
import { queryOptions } from "@tanstack/react-query";
import { minutesToMilliseconds } from "date-fns";

// Content-addressed, so a stream never goes stale; `gcTime` stays finite because an rrweb stream can be large.
const CAPTURE_GC_TIME = minutesToMilliseconds(30);

export function captureEventsQuery(
  walkthroughId: WalkthroughId,
  media: string
) {
  return queryOptions({
    gcTime: CAPTURE_GC_TIME,
    queryFn: ({ signal }) => api.captures.events(walkthroughId, media, signal),
    queryKey: ["capture-events", walkthroughId, media],
    staleTime: Infinity,
  });
}
