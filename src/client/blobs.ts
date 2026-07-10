/**
 * Lazy, content-addressed blob sourcing for context expansion. A patch-only
 * diff leaves the renderer `isPartial`, which disables hunk and whole-file
 * context expansion. To turn it back on, a file is re-parsed from its full base
 * and head blobs — fetched on demand from `GET /api/blob/:sha` — which the
 * renderer can then expand freely (diff-review.md §4). No DOM or React here:
 * this is the pure blob→diff model the Diff tab drives.
 */

import type { FileDiffMetadata } from "@pierre/diffs";
import { parseDiffFromFile } from "@pierre/diffs";

/** The content-addressed blob endpoint for a git object id. */
export function blobUrl(sha: string): string {
  return `/api/blob/${sha}`;
}

/**
 * Whether a file's unchanged context can be lazily expanded. The renderer only
 * expands when fed a full (non-partial) diff, which needs both the base and
 * head blobs — so a patch-only diff with both object ids qualifies. Adds,
 * deletes and pure renames lack a both-sided body to expand around and are
 * skipped.
 */
export function isExpandable(fileDiff: FileDiffMetadata): boolean {
  return (
    fileDiff.isPartial && fileDiff.prevObjectId !== undefined && fileDiff.newObjectId !== undefined
  );
}

/**
 * Re-parse a file's diff from its full base and head blob text, yielding a
 * non-partial `FileDiffMetadata` whose deletion/addition lines are the complete
 * files. Replacing the partial item with this one lets the renderer expand
 * context. The blob ids are content-addressed, so they double as stable
 * highlighter cache keys.
 */
export function expandedFileDiff(
  fileDiff: FileDiffMetadata,
  baseText: string,
  headText: string,
): FileDiffMetadata {
  const prevName = fileDiff.prevName ?? fileDiff.name;
  return parseDiffFromFile(
    { cacheKey: fileDiff.prevObjectId, contents: baseText, name: prevName },
    { cacheKey: fileDiff.newObjectId, contents: headText, name: fileDiff.name },
  );
}

/**
 * Lazily fetch a file's base and head blobs and build its full, expandable
 * diff. Both sides (split view) resolve through the same `/api/blob/:sha`
 * endpoint; the file's own `prevObjectId`/`newObjectId` from the patch's index
 * line make each blob addressable. Callers gate this behind `isExpandable`.
 */
async function fetchBlobText(sha: string): Promise<string> {
  const url = blobUrl(sha);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  }
  return res.text();
}

export async function fetchExpandedFileDiff(fileDiff: FileDiffMetadata): Promise<FileDiffMetadata> {
  const { prevObjectId, newObjectId } = fileDiff;
  if (prevObjectId === undefined || newObjectId === undefined) {
    throw new Error(`file ${fileDiff.name} has no base/head blob to expand`);
  }
  const [baseText, headText] = await Promise.all([
    fetchBlobText(prevObjectId),
    fetchBlobText(newObjectId),
  ]);
  return expandedFileDiff(fileDiff, baseText, headText);
}
