export function subscribe(onReviewChanged: () => void): () => void {
  const source = new EventSource("/api/events");

  source.addEventListener("review-changed", () => onReviewChanged());

  source.addEventListener("error", () => {
    // EventSource auto-reconnects; surface the drop but leave the stream up.
    console.warn("Review event stream error; the browser will reconnect.");
  });

  return () => source.close();
}
