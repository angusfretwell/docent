/**
 * Purely lexical: a symlink under `root` that points outside it resolves to a
 * path this cannot see. A caller reading real filesystem entries should
 * additionally resolve symlinks and recheck the real path with
 * {@link isContained}.
 */

import path from "node:path";

export function isContained(root: string, candidate: string): boolean {
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate.startsWith(prefix);
}

export function safeJoin(root: string, ...segments: string[]): string | null {
  if (segments.some((segment) => path.isAbsolute(segment))) {
    return null;
  }
  const resolved = path.resolve(root, ...segments);
  return isContained(root, resolved) ? resolved : null;
}
