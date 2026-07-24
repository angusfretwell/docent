import { api } from "@client/api";

const inFlight = new Map<string, Promise<string>>();

/**
 * @param signal First-caller-wins: only the caller that opens a sha's fetch can
 * abort it, and aborting rejects the shared promise for every later caller too.
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
