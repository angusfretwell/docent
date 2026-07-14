import type { ChangeTypes, FileDiffMetadata } from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";
import type { GitStatus } from "@pierre/trees";
import { prepareFileTreeInput } from "@pierre/trees";

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

/**
 * One file of a parsed patch: its metadata plus the stable identity the tree,
 * the scroll, and the viewed fold all share. `id` is minted from the file's
 * patch order before any sorting or filtering, so narrowing the visible set
 * never re-keys the remaining files.
 */
export interface DiffFile {
  /**
   * Head-blob object id — the key mark-as-viewed asserts against ("I've seen
   * this file's resulting content"). A deletion carries the null-SHA head id;
   * a content-less change (mode-only) falls back to the base id, then empty.
   */
  blobSha: string;
  file: FileDiffMetadata;
  id: string;
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

/**
 * Version number for a diff item in a controlled CodeView. The CodeView
 * re-renders an item only when its `version` changes, so the version just
 * needs to change whenever the rendered inputs (blobs, collapse, inline
 * annotations) do — hashing a stamp of those inputs gives that as a pure
 * function of them.
 */
export function diffItemVersion(
  { blobSha, file }: DiffFile,
  collapsed: boolean,
  annotationsKey = ""
): number {
  return stringHash(
    `${blobSha}:${file.prevObjectId ?? ""}:${collapsed ? 1 : 0}:${annotationsKey}`
  );
}

/** Total added and deleted line counts across every file in a patch. */
export function patchStats(patch: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const file of processPatch(patch).files) {
    for (const hunk of file.hunks) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }
  }

  return { additions, deletions };
}

/** Parse a patch into identified files, sorted in file-tree order. */
export function parsePatchFiles(patch: string): DiffFile[] {
  const files = processPatch(patch).files.map((file, index) => ({
    blobSha: file.newObjectId ?? file.prevObjectId ?? "",
    // The worker pool primes and reuses syntax-highlight results keyed by
    // `cacheKey`; without it, priming is skipped and every file re-highlights
    // on scroll. The base/head blob ids capture content exactly and the name
    // captures the inferred language, so this changes iff the render would.
    file: {
      ...file,
      cacheKey: `${file.name}:${file.prevObjectId ?? ""}:${file.newObjectId ?? ""}`,
    },
    id: itemId(file.name, index),
    path: file.name,
  }));

  return sortInTreeOrder(files);
}
