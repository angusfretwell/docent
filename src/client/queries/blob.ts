import { api } from "@client/api";
import { queryOptions } from "@tanstack/react-query";
import { minutesToMilliseconds } from "date-fns";

// Content-addressed, so a blob never goes stale; `gcTime` stays finite because whole-file text adds up across a range.
const BLOB_GC_TIME = minutesToMilliseconds(30);

export function blobQueryOptions(sha: string) {
  return queryOptions({
    gcTime: BLOB_GC_TIME,
    queryFn: ({ signal }) => api.blob.text(sha, signal),
    queryKey: ["blob", sha],
    staleTime: Infinity,
  });
}
