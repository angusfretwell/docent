import { eventsUrl } from "../lib/basepath";

export interface Backend {
  /** The central `ky` instance is the only caller and always passes a `Request`, so an implementation may assume one. */
  fetch: (
    input: Request | URL | string,
    init?: RequestInit
  ) => Promise<Response>;
  subscribe: (onReviewChanged: () => void) => () => void;
}

function subscribeWithEventSource(onReviewChanged: () => void): () => void {
  const source = new EventSource(eventsUrl);

  source.addEventListener("review-changed", () => onReviewChanged());

  source.addEventListener("error", () => {
    // EventSource auto-reconnects; surface the drop but leave the stream up.
    console.warn("Review event stream error; the browser will reconnect.");
  });

  return () => source.close();
}

const installed: Partial<Backend> = {};

/**
 * Replaces how the client reaches its backend, for a host that serves the
 * client without one. Both slots are read per call, so this may run after the
 * api modules have loaded. The subscription is a slot of its own because an
 * `EventSource` opens its own connection and cannot be routed through `fetch`.
 */
export function setBackend(backend: Partial<Backend>): void {
  Object.assign(installed, backend);
}

export const backend: Backend = {
  fetch: (input, init) => (installed.fetch ?? globalThis.fetch)(input, init),
  subscribe: (onReviewChanged) =>
    (installed.subscribe ?? subscribeWithEventSource)(onReviewChanged),
};
