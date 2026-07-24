/**
 * The `.docent/` watch pushes an SSE event that re-fetches the snapshot after a
 * write; the success-side invalidation here only shortens the round trip for
 * the author's own tab.
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
