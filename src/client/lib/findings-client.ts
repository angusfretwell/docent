/**
 * The browser's Finding write client: one POST to `/api/findings` per
 * append-only record (data-model.md §5, architecture.md §2). The server mints
 * the Change, stamps attribution and `changeId`, and drops the file; the
 * `.docent/` watch then pushes an SSE event that re-fetches the snapshot, so the
 * caller does not thread the result through — it only needs to know the write
 * landed.
 */

import type { FindingWrite, FindingWriteResult } from "@shared/schemas/finding-write";

export async function writeFinding(write: FindingWrite): Promise<FindingWriteResult> {
  const res = await fetch("/api/findings", {
    body: JSON.stringify(write),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`POST /api/findings failed: HTTP ${res.status}`);
  }
  return (await res.json()) as FindingWriteResult;
}
