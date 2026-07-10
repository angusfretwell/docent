/**
 * Pure navigation model for the Diff tab: parse a Change's patch into file
 * entries, build the compact-folder tree, sort/filter, and resolve the
 * next/prev jump primitives. No DOM or renderer here — this is the position
 * model the tree, the scroll, and the keyboard jumps all read from, so they
 * stay in agreement by construction.
 */

import type { ChangeTypes, FileDiffMetadata } from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";

/** VS Code-style single-letter change badge. */
export type ChangeType = "A" | "M" | "D" | "R";

export interface FileEntry {
  /** Stable id, `${name}#${patchIndex}` — matches the CodeView item id. */
  id: string;
  /** Full path (the new name for renames). */
  path: string;
  /** Previous path, present only for renames. */
  prevPath?: string;
  /**
   * Head-blob object id — the key mark-as-viewed asserts against ("I've seen
   * this file's resulting content", diff-review.md §3). Empty for a deletion,
   * which has no head blob; the file's own path still scopes its viewed state.
   */
  blobSha: string;
  changeType: ChangeType;
  additions: number;
  deletions: number;
  /** Hunk count — the number of contiguous changes in this file. */
  hunks: number;
  /** New-file start line of each hunk, for hunk-level scroll targeting. */
  hunkStarts: number[];
}

/** Default is `"path"`; `"size"` is the opt-in largest-hunks-first toggle. */
export type FileOrder = "path" | "size";

export interface DirNode {
  kind: "dir";
  /** Display name — a compacted `a/b/c` chain for single-child folders. */
  name: string;
  /** Full path of this directory. */
  path: string;
  children: TreeNode[];
}

export interface FileNode {
  kind: "file";
  /** Basename shown in the row. */
  name: string;
  entry: FileEntry;
}

export type TreeNode = DirNode | FileNode;

/** One contiguous hunk, addressed for hunk-level next/prev-change jumps. */
export interface ChangeAnchor {
  fileId: string;
  hunkIndex: number;
  /** New-file line to scroll to for this hunk. */
  lineNumber: number;
}

const CHANGE_TYPE: Record<ChangeTypes, ChangeType> = {
  change: "M",
  deleted: "D",
  new: "A",
  "rename-changed": "R",
  "rename-pure": "R",
};

function toEntry(file: FileDiffMetadata, index: number): FileEntry {
  let additions = 0;
  let deletions = 0;
  const hunkStarts: number[] = [];
  for (const hunk of file.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
    hunkStarts.push(hunk.additionStart);
  }
  return {
    additions,
    blobSha: file.newObjectId ?? "",
    changeType: CHANGE_TYPE[file.type],
    deletions,
    hunkStarts,
    hunks: file.hunks.length,
    id: `${file.name}#${index}`,
    path: file.name,
    ...(file.prevName === undefined ? {} : { prevPath: file.prevName }),
  };
}

/** Parse a Change's patch into per-file entries, in patch order. */
export function parseFiles(patch: string): FileEntry[] {
  return processPatch(patch).files.map(toEntry);
}

function changedLines(entry: FileEntry): number {
  return entry.additions + entry.deletions;
}

/** Lexicographic path comparator: -1, 0, or 1. */
function comparePath(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Sort a copy of the entries by full path, or by changed-line size. */
export function sortEntries(entries: FileEntry[], order: FileOrder): FileEntry[] {
  const sorted = [...entries];
  if (order === "size") {
    sorted.sort((a, b) => changedLines(b) - changedLines(a) || (a.path < b.path ? -1 : 1));
  } else {
    sorted.sort((a, b) => comparePath(a.path, b.path));
  }
  return sorted;
}

/** Collapse single-child directory chains into one row (VS Code style). */
function compact(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "file") {
      return node;
    }
    let dir = node;
    while (dir.children.length === 1 && dir.children[0]?.kind === "dir") {
      const [child] = dir.children;
      dir = {
        children: child.children,
        kind: "dir",
        name: `${dir.name}/${child.name}`,
        path: child.path,
      };
    }
    return { ...dir, children: compact(dir.children) };
  });
}

/**
 * Build the compact-folder tree. Sibling order follows the entries' order, so
 * `flattenFiles(buildTree(sorted))` reproduces `sorted` for a path-sorted
 * (directory-grouped) input — that is how the tree and the scroll agree.
 */
export function buildTree(entries: FileEntry[]): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const entry of entries) {
    const parts = entry.path.split("/");
    const fileName = parts.pop() ?? entry.path;
    let cursor = roots;
    let prefix = "";
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      const dirPath = prefix;
      let dir = cursor.find(
        (node): node is DirNode => node.kind === "dir" && node.path === dirPath,
      );
      if (dir === undefined) {
        dir = { children: [], kind: "dir", name: part, path: dirPath };
        cursor.push(dir);
      }
      cursor = dir.children;
    }
    cursor.push({ entry, kind: "file", name: fileName });
  }
  return compact(roots);
}

/** Depth-first file entries — the order the single scroll renders in. */
export function flattenFiles(nodes: TreeNode[]): FileEntry[] {
  const out: FileEntry[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      out.push(node.entry);
    } else {
      out.push(...flattenFiles(node.children));
    }
  }
  return out;
}

/** Keep entries whose path contains `query` (case-insensitive substring). */
export function filterEntries(entries: FileEntry[], query: string): FileEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return entries;
  }
  return entries.filter((entry) => entry.path.toLowerCase().includes(needle));
}

/** Flatten ordered entries into their hunk-level change anchors. */
export function changeAnchors(entries: FileEntry[]): ChangeAnchor[] {
  const anchors: ChangeAnchor[] = [];
  for (const entry of entries) {
    // Adds/deletes still expose one anchor so an empty-hunk file is reachable.
    const count = Math.max(entry.hunks, 1);
    for (let hunkIndex = 0; hunkIndex < count; hunkIndex += 1) {
      anchors.push({
        fileId: entry.id,
        hunkIndex,
        lineNumber: entry.hunkStarts[hunkIndex] ?? 1,
      });
    }
  }
  return anchors;
}

/** Next/prev file id in the ordered list, or undefined at the ends. */
export function stepFile(
  orderedIds: string[],
  currentId: string | undefined,
  direction: 1 | -1,
): string | undefined {
  const index = currentId === undefined ? -1 : orderedIds.indexOf(currentId);
  const next = index + direction;
  return next >= 0 && next < orderedIds.length ? orderedIds[next] : undefined;
}

/** Next/prev change index, clamped to the anchor list (crosses files). */
export function stepChange(count: number, currentIndex: number, direction: 1 | -1): number {
  const next = currentIndex + direction;
  if (next < 0) {
    return 0;
  }
  return next >= count ? count - 1 : next;
}
