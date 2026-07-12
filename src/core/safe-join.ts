/**
 * Path containment: join path segments onto a root and confirm the result
 * cannot land outside it. The one home for a check that otherwise gets
 * reinvented per call site (a worktree file read, a capture blob read) —
 * each with its own ad hoc guard against a `..`-laden or absolute path.
 *
 * Purely lexical: `path.resolve` normalizes `..`/`.` segments and rejects an
 * absolute one outright, but a symlink that lives under `root` and points
 * outside it resolves to a path this can't see. A caller reading real
 * filesystem entries (as opposed to a virtual/content-addressed path) should
 * additionally resolve symlinks and recheck the real path with
 * {@link isContained}.
 */

import path from "node:path";

/** Whether `candidate` (an absolute path) lies at or under `root`. */
export function isContained(root: string, candidate: string): boolean {
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate.startsWith(prefix);
}

/**
 * Join `segments` onto `root`, or `null` when the result would land outside
 * `root` — an absolute segment, or a `..` that walks past it.
 */
export function safeJoin(root: string, ...segments: string[]): string | null {
  if (segments.some((segment) => path.isAbsolute(segment))) {
    return null;
  }
  const resolved = path.resolve(root, ...segments);
  return isContained(root, resolved) ? resolved : null;
}
