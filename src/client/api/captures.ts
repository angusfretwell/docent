import type { WalkthroughId } from "@shared/schemas/ids";

import { client } from "./client";

/**
 * `GET /api/capture/:walkthrough/:file.rrweb.json` — a capture's rrweb event
 * stream. Both still frames and recordings are rrweb streams, so a media id
 * always resolves to `<id>.rrweb.json`. The path is built here so callers pass
 * ids, not URLs. No schema decode — rrweb arrays are consumed opaquely.
 */
export function events(
  walkthroughId: WalkthroughId,
  file: string,
  signal?: AbortSignal
): Promise<unknown[]> {
  return client
    .get(`capture/${walkthroughId}/${file}.rrweb.json`, { signal })
    .json<unknown[]>();
}
