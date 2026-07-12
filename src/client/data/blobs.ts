/**
 * Content-addressed blob queries: a sha names its bytes forever, so each
 * query is immutable — `staleTime: Infinity`, never invalidated by the SSE
 * bridge. `gcTime` stays finite because blobs (whole file texts, rrweb event
 * streams) can be large; an unused entry is dropped rather than held for the
 * session. The composite diff expanders live here too, so a repeat "Expand
 * context" on the same file resolves from the cache instead of re-fetching.
 */

import type { FileDiffMetadata } from "@pierre/diffs";
import { queryOptions } from "@tanstack/react-query";
import { minutesToMilliseconds } from "date-fns";

import {
  expandedFileDiff,
  fetchBlobSize,
  fetchBlobText,
  fetchCaptureEvents,
  fetchWorktreeText,
} from "../lib/blobs";
import { queryClient } from "./query-client";

const BLOB_GC_TIME = minutesToMilliseconds(30);

/** A git blob's full text, keyed by its object id. */
export function blobTextQuery(sha: string) {
  return queryOptions({
    gcTime: BLOB_GC_TIME,
    queryFn: ({ signal }) => fetchBlobText(sha, signal),
    queryKey: ["blob-text", sha],
    staleTime: Infinity,
  });
}

/**
 * A git blob's byte size (header-only read, diff-review.md §5). A missing or
 * all-zero id resolves to 0 without a fetch — the absent side of an
 * add/delete contributes nothing to the delta.
 */
export function blobSizeQuery(sha: string | undefined) {
  return queryOptions({
    gcTime: BLOB_GC_TIME,
    queryFn: ({ signal }) => fetchBlobSize(sha, signal),
    queryKey: ["blob-size", sha ?? null],
    staleTime: Infinity,
  });
}

/** A recording capture's rrweb event stream, keyed by its content-addressed URL. */
export function captureEventsQuery(url: string) {
  return queryOptions({
    gcTime: BLOB_GC_TIME,
    queryFn: ({ signal }) => fetchCaptureEvents(url, signal),
    queryKey: ["capture-events", url],
    staleTime: Infinity,
  });
}

/**
 * Lazily fetch a file's base and head blobs and build its full, expandable
 * diff. Both sides resolve through the blob cache (`fetchQuery`), so
 * re-expanding a file after its diff row remounts costs no network. Callers
 * gate this behind `isExpandable`.
 */
export async function fetchExpandedFileDiff(
  fileDiff: FileDiffMetadata
): Promise<FileDiffMetadata> {
  const { prevObjectId, newObjectId } = fileDiff;
  if (prevObjectId === undefined || newObjectId === undefined) {
    throw new Error(`file ${fileDiff.name} has no base/head blob to expand`);
  }
  const [baseText, headText] = await Promise.all([
    queryClient.fetchQuery(blobTextQuery(prevObjectId)),
    queryClient.fetchQuery(blobTextQuery(newObjectId)),
  ]);
  return expandedFileDiff(fileDiff, baseText, headText);
}

/**
 * Lazily build a Pending file's full, expandable diff. The base side is the
 * committed blob, served from the blob cache; the head side is the live
 * working-tree file read by path from the uncached `/api/worktree` endpoint —
 * the Pending diff's head has no stable SHA to cache against
 * (diff-review.md §6), so it is fetched fresh every time. Callers gate this
 * behind `isPendingExpandable`.
 */
export async function fetchPendingExpandedFileDiff(
  fileDiff: FileDiffMetadata
): Promise<FileDiffMetadata> {
  const { prevObjectId } = fileDiff;
  if (prevObjectId === undefined) {
    throw new Error(`file ${fileDiff.name} has no base blob to expand`);
  }
  const [baseText, headText] = await Promise.all([
    queryClient.fetchQuery(blobTextQuery(prevObjectId)),
    fetchWorktreeText(fileDiff.name),
  ]);
  return expandedFileDiff(fileDiff, baseText, headText);
}
