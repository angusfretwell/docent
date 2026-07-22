/**
 * The live-reload subscription (`GET /api/events`). Not a ky request — this is
 * the browser's `EventSource`, which owns its own auto-reconnect (H6 allows
 * `EventSource` only through this helper). `onReviewChanged` fires on each
 * `review-changed` frame; the returned function closes the stream.
 */

export function subscribe(onReviewChanged: () => void): () => void {
  const source = new EventSource("/api/events");

  source.addEventListener("review-changed", () => onReviewChanged());

  source.addEventListener("error", () => {
    // EventSource reconnects on its own; surface a persistent drop so it isn't
    // silent, but leave the stream up for the browser to retry.
    console.warn("Review event stream error; the browser will reconnect.");
  });

  return () => source.close();
}
