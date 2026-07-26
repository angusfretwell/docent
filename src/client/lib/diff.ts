import type { ChangeTypes, FileDiffMetadata } from "@pierre/diffs";
import { processFile } from "@pierre/diffs";
import type { GitStatus } from "@pierre/trees";
import { prepareFileTreeInput } from "@pierre/trees";
import { isRealObjectId, parsePatchBlocks } from "@shared/lib/patch";

const ChangeTypeGitStatus: Record<ChangeTypes, GitStatus> = {
  change: "modified",
  deleted: "deleted",
  new: "added",
  "rename-changed": "renamed",
  "rename-pure": "renamed",
};

export function statusForChange(change: ChangeTypes) {
  return ChangeTypeGitStatus[change];
}

export function itemId(path: string, index: number) {
  return `${path}:${index}`;
}

// `id` is minted from patch order before any sort or filter, so narrowing the visible set never re-keys files.
export interface DiffFile {
  /** Head-blob object id mark-as-viewed asserts against; falls back to base id, then empty, when there is no head blob. */
  blobSha: string;
  file: FileDiffMetadata;
  id: string;
  /** This file's slice of the patch, so it can be re-parsed against both blobs. */
  patch: string;
  path: string;
}

function sortInTreeOrder(files: DiffFile[]): DiffFile[] {
  const treeOrder = new Map(
    prepareFileTreeInput(files.map((entry) => entry.path)).paths.map(
      (path, index) => [path, index]
    )
  );

  return [...files].toSorted(
    (left, right) =>
      (treeOrder.get(left.path) ?? 0) - (treeOrder.get(right.path) ?? 0)
  );
}

function stringHash(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + (value.codePointAt(index) ?? 0)) % 4_294_967_296;
  }

  return hash;
}

// The CodeView re-renders an item only when its `version` changes, so hash the rendered inputs into it.
export function diffItemVersion(
  { blobSha, file }: DiffFile,
  collapsed: boolean,
  annotationsKey = ""
): number {
  return stringHash(
    `${blobSha}:${file.prevObjectId ?? ""}:${file.isPartial ? 1 : 0}:${collapsed ? 1 : 0}:${annotationsKey}`
  );
}

function splitPatch(
  patch: string
): { file: FileDiffMetadata; slice: string }[] {
  const files: { file: FileDiffMetadata; slice: string }[] = [];

  for (const slice of parsePatchBlocks(patch)) {
    const file = processFile(slice, { isGitDiff: true });

    if (file !== undefined) {
      files.push({ file, slice });
    }
  }

  return files;
}

export function patchStats(patch: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const { file } of splitPatch(patch)) {
    for (const hunk of file.hunks) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }
  }

  return { additions, deletions };
}

// The worker pool primes and reuses syntax-highlight results keyed by `cacheKey`; without it every file re-highlights on scroll.
function highlightKey(file: FileDiffMetadata): string {
  const sides = `${file.prevObjectId ?? ""}:${file.newObjectId ?? ""}`;

  return `${file.name}:${sides}:${file.isPartial ? "hunks" : "whole"}`;
}

export function parsePatchFiles(patch: string): DiffFile[] {
  const files = splitPatch(patch).map(({ file, slice }, index) => ({
    blobSha: file.newObjectId ?? file.prevObjectId ?? "",
    file: { ...file, cacheKey: highlightKey(file) },
    id: itemId(file.name, index),
    patch: slice,
    path: file.name,
  }));

  return sortInTreeOrder(files);
}

/** Blobs needed to render this file whole, in base-then-head order so callers can destructure the pair. */
export function expansionBlobs({ file }: DiffFile): string[] {
  const { newObjectId, prevObjectId } = file;

  const hasUnchangedContext = file.hunks.length > 0;
  const hasBothBlobs =
    isRealObjectId(prevObjectId) && isRealObjectId(newObjectId);

  if (!hasUnchangedContext || !hasBothBlobs) {
    return [];
  }

  return [prevObjectId, newObjectId];
}

/** Re-parses the file against both blobs, which is what lets its hunks expand. */
export function withBlobContents(
  entry: DiffFile,
  contents: ReadonlyMap<string, string>
): DiffFile {
  const [base, head] = expansionBlobs(entry);
  const oldContents = base === undefined ? undefined : contents.get(base);
  const newContents = head === undefined ? undefined : contents.get(head);

  if (oldContents === undefined || newContents === undefined) {
    return entry;
  }

  const file = processFile(entry.patch, {
    isGitDiff: true,
    newFile: { contents: newContents, name: entry.path },
    oldFile: { contents: oldContents, name: entry.path },
  });

  return file === undefined
    ? entry
    : { ...entry, file: { ...file, cacheKey: highlightKey(file) } };
}
