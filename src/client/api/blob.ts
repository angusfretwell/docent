import { client } from "./client";

/**
 * `GET /api/blob/:sha` — a git object's text. Content-addressed, so the bytes
 * never change; callers (see `lib/blobs.ts`) own the in-flight dedup above this.
 */
export function text(sha: string, signal?: AbortSignal): Promise<string> {
  return client.get(`blob/${sha}`, { signal }).text();
}
