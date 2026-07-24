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

// `id` is minted from patch order before any sort or filter, so narrowing the visible set never re-keys files.
export interface DiffFile {
  /** Head-blob object id mark-as-viewed asserts against; falls back to base id, then empty, when there is no head blob. */
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

// The CodeView re-renders an item only when its `version` changes, so hash the rendered inputs into it.
export function diffItemVersion(
  { blobSha, file }: DiffFile,
  collapsed: boolean,
  annotationsKey = ""
): number {
  return stringHash(
    `${blobSha}:${file.prevObjectId ?? ""}:${collapsed ? 1 : 0}:${annotationsKey}`
  );
}

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

export function parsePatchFiles(patch: string): DiffFile[] {
  const files = processPatch(patch).files.map((file, index) => ({
    blobSha: file.newObjectId ?? file.prevObjectId ?? "",
    // The worker pool primes and reuses syntax-highlight results keyed by `cacheKey`; without it every file re-highlights on scroll.
    file: {
      ...file,
      cacheKey: `${file.name}:${file.prevObjectId ?? ""}:${file.newObjectId ?? ""}`,
    },
    id: itemId(file.name, index),
    path: file.name,
  }));

  return sortInTreeOrder(files);
}
