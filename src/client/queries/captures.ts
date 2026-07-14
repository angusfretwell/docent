import { fetchCaptureEvents } from "@client/lib/captures";
import { queryOptions } from "@tanstack/react-query";
import { minutesToMilliseconds } from "date-fns";

// Capture blobs are content-addressed, so a URL names its bytes forever and the
// query never goes stale. `gcTime` stays finite because an rrweb event stream
// can be large — an unused one is dropped rather than held for the session.
const CAPTURE_GC_TIME = minutesToMilliseconds(30);

/** A recording capture's rrweb event stream, keyed by its content-addressed URL. */
export function captureEventsQuery(url: string) {
  return queryOptions({
    gcTime: CAPTURE_GC_TIME,
    queryFn: ({ signal }) => fetchCaptureEvents(url, signal),
    queryKey: ["capture-events", url],
    staleTime: Infinity,
  });
}
