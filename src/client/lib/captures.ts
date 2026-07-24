/**
 * Capture media sourcing for the Product walkthrough (walkthroughs.md §6).
 * Capture blobs are content-addressed but live in the walkthrough's own
 * gitignored `captures/` dir rather than in git, so they are served by
 * `/api/capture/:walkthrough/:file` instead of the `/api/blob/:sha` endpoint
 * the code side reads from. No DOM or React here.
 */

import type { WalkthroughId } from "@shared/schemas/ids";

/**
 * The content-addressed endpoint for a capture blob. Every capture — still frame
 * or recording — is an rrweb event stream, so a media sha always resolves to
 * `<sha>.rrweb.json`.
 */
export function captureUrl(
  walkthroughId: WalkthroughId,
  media: string
): string {
  return `/api/capture/${walkthroughId}/${media}.rrweb.json`;
}

/** Fetch a capture's rrweb event stream from its content-addressed blob. */
export async function fetchCaptureEvents(
  url: string,
  signal?: AbortSignal
): Promise<unknown[]> {
  const res = await fetch(url, { signal });

  if (!res.ok) {
    throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  }

  return res.json() as Promise<unknown[]>;
}
