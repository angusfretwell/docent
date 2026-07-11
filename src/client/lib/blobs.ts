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

/** The uncached working-tree endpoint for a repo-relative path (Pending head side). */
export function worktreeUrl(path: string): string {
  return `/api/worktree?path=${encodeURIComponent(path)}`;
}

/**
 * The content-addressed endpoint for a product-walkthrough capture blob
 * (walkthroughs.md §6). A screenshot's media sha resolves to `<sha>.png`, a
 * recording's to `<sha>.rrweb.json` — the extension the server keys its
 * content-type off. Served from the walkthrough's own `captures/` dir, not
 * `git cat-file`, since capture media is a gitignored Review file.
 */
export function captureUrl(
  walkthroughId: string,
  media: string,
  kind: "screenshot" | "recording"
): string {
  const ext = kind === "screenshot" ? "png" : "rrweb.json";
  return `/api/capture/${walkthroughId}/${media}.${ext}`;
}

/** Fetch a recording capture's rrweb event stream from its content-addressed blob. */
export async function fetchCaptureEvents(url: string): Promise<unknown[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown[]>;
}

/** The content-addressed byte-size endpoint for a git blob (binary size deltas). */
export function blobSizeUrl(sha: string): string {
  return `/api/blob/${sha}/size`;
}

/** Whether an object id names real content — a null id (all zeros) has no blob. */
export function isRealObjectId(id: string | undefined): id is string {
  return id !== undefined && !/^0+$/.test(id);
}

/**
 * Fetch a git blob's byte size from `/api/blob/:sha/size`, which reads only the
 * object header (never the bytes). Used by the binary size-delta chrome
 * (diff-review.md §5). A null/absent id resolves to 0 — a missing side of an
 * add/delete contributes nothing to the delta.
 */
export async function fetchBlobSize(sha: string | undefined): Promise<number> {
  if (!isRealObjectId(sha)) {
    return 0;
  }
  const url = blobSizeUrl(sha);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { size?: unknown };
  const { size } = body;
  return typeof size === "number" ? size : 0;
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
    fileDiff.isPartial &&
    fileDiff.prevObjectId !== undefined &&
    fileDiff.newObjectId !== undefined
  );
}

/**
 * Whether a Pending file's context can be expanded. Same as `isExpandable`, but
 * the head side is the mutable working tree (fetched by path, not by SHA), so
 * the null head id `git diff HEAD` prints is expected — we require only that
 * both sides name real content: a modify has a committed base blob and a live
 * head file. Untracked adds (null base) and deletions (null head) have nothing
 * to expand around.
 */
export function isPendingExpandable(fileDiff: FileDiffMetadata): boolean {
  return (
    fileDiff.isPartial &&
    isRealObjectId(fileDiff.prevObjectId) &&
    isRealObjectId(fileDiff.newObjectId)
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
  headText: string
): FileDiffMetadata {
  const prevName = fileDiff.prevName ?? fileDiff.name;
  return parseDiffFromFile(
    { cacheKey: fileDiff.prevObjectId, contents: baseText, name: prevName },
    { cacheKey: fileDiff.newObjectId, contents: headText, name: fileDiff.name }
  );
}

/** Fetch a single blob's text from the content-addressed `/api/blob/:sha` endpoint. */
export async function fetchBlobText(sha: string): Promise<string> {
  const url = blobUrl(sha);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  }
  return res.text();
}

/** Fetch a working-tree file's live text from the uncached `/api/worktree` endpoint. */
async function fetchWorktreeText(path: string): Promise<string> {
  const url = worktreeUrl(path);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  }
  return res.text();
}

/**
 * Lazily fetch a file's base and head blobs and build its full, expandable
 * diff. Both sides (split view) resolve through the same `/api/blob/:sha`
 * endpoint; the file's own `prevObjectId`/`newObjectId` from the patch's index
 * line make each blob addressable. Callers gate this behind `isExpandable`.
 */
export async function fetchExpandedFileDiff(
  fileDiff: FileDiffMetadata
): Promise<FileDiffMetadata> {
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

/**
 * Lazily build a Pending file's full, expandable diff. The base side is the
 * committed blob (cached, content-addressed `/api/blob/:sha`); the head side is
 * the live working-tree file read by path from the uncached `/api/worktree`
 * endpoint — the Pending diff's head has no stable SHA to cache against
 * (diff-review.md §6). Callers gate this behind `isPendingExpandable`.
 */
export async function fetchPendingExpandedFileDiff(
  fileDiff: FileDiffMetadata
): Promise<FileDiffMetadata> {
  const { prevObjectId } = fileDiff;
  if (prevObjectId === undefined) {
    throw new Error(`file ${fileDiff.name} has no base blob to expand`);
  }
  const [baseText, headText] = await Promise.all([
    fetchBlobText(prevObjectId),
    fetchWorktreeText(fileDiff.name),
  ]);
  return expandedFileDiff(fileDiff, baseText, headText);
}
