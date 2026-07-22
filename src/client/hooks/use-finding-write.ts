/**
 * The browser's Finding write path: one POST to `/api/findings` per
 * append-only record. The server mints the Change, stamps attribution and
 * `changeId`, and drops the file; the `.docent/` watch then pushes an SSE
 * event that re-fetches the snapshot. The success-side invalidation here only
 * shortens the round trip for the author's own tab.
 */

import { api } from "@client/api";
import type { FindingWrite } from "@shared/schemas/finding-write";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useFindingWrite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (write: FindingWrite) => api.findings.write(write),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["review"] }),
  });
}
