/**
 * The browser's Finding write path: one POST to `/api/findings` per
 * append-only record. The server mints the Change, stamps attribution and
 * `changeId`, and drops the file; the `.docent/` watch then pushes an SSE
 * event that re-fetches the snapshot. The success-side invalidation here only
 * shortens the round trip for the author's own tab.
 */

import type {
  FindingWrite,
  FindingWriteResult,
} from "@shared/schemas/finding-write";
import { useMutation, useQueryClient } from "@tanstack/react-query";

async function postFinding(write: FindingWrite): Promise<FindingWriteResult> {
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

export function useFindingWrite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postFinding,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["review"] }),
  });
}
