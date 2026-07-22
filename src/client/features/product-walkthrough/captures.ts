import { api } from "@client/api";
import { queryOptions } from "@tanstack/react-query";
import { minutesToMilliseconds } from "date-fns";

// Capture blobs are content-addressed, so a stream names its bytes forever and
// the query never goes stale. `gcTime` stays finite because an rrweb event
// stream can be large — an unused one is dropped rather than held for the session.
const CAPTURE_GC_TIME = minutesToMilliseconds(30);

/** A recording capture's rrweb event stream, keyed by its content-addressed ids. */
export function captureEventsQuery(walkthroughId: string, media: string) {
  return queryOptions({
    gcTime: CAPTURE_GC_TIME,
    queryFn: ({ signal }) => api.captures.events(walkthroughId, media, signal),
    queryKey: ["capture-events", walkthroughId, media],
    staleTime: Infinity,
  });
}
