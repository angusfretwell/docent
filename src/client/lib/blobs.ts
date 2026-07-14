/**
 * Lazy, content-addressed blob text sourcing from `GET /api/blob/:sha`. The
 * blobs are git objects, so a sha's content never changes — fetches are
 * deduplicated and cached for the page's lifetime. No DOM or React here.
 */

/** The content-addressed blob endpoint for a git object id. */
export function blobUrl(sha: string): string {
  return `/api/blob/${sha}`;
}

async function loadBlobText(
  sha: string,
  signal?: AbortSignal
): Promise<string> {
  const url = blobUrl(sha);
  const res = await fetch(url, { signal });

  if (!res.ok) {
    throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  }

  return res.text();
}

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

  const pending = loadBlobText(sha, signal).catch((error: unknown) => {
    inFlight.delete(sha);
    throw error;
  });

  inFlight.set(sha, pending);

  return pending;
}
