/**
 * Lazy, content-addressed blob text sourcing. The blobs are git objects, so a
 * sha's content never changes — fetches are deduplicated and cached for the
 * page's lifetime. Transport lives in `api.blob.text`; this module owns only the
 * in-flight dedup above it. No DOM or React here.
 */

import { api } from "@client/api";

const inFlight = new Map<string, Promise<string>>();

/**
 * Fetch a git blob's text, reusing an in-flight or already-settled fetch for the
 * same sha. Several drift surfaces re-anchor against the same blobs, so without
 * this each one would refetch. A failure evicts its entry, so a later caller
 * retries rather than inheriting the error forever.
 */
export function fetchBlobText(
  sha: string,
  signal?: AbortSignal
): Promise<string> {
  const cached = inFlight.get(sha);

  if (cached !== undefined) {
    return cached;
  }

  const pending = api.blob.text(sha, signal).catch((error: unknown) => {
    inFlight.delete(sha);
    throw error;
  });

  inFlight.set(sha, pending);

  return pending;
}
