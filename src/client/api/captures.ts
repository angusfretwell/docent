import type { WalkthroughId } from "@shared/schemas/ids";

import { client } from "./client";

export function events(
  walkthroughId: WalkthroughId,
  file: string,
  signal?: AbortSignal
): Promise<unknown[]> {
  return client
    .get(`capture/${walkthroughId}/${file}.rrweb.json`, { signal })
    .json<unknown[]>();
}
