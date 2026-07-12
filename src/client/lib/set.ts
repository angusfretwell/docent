/**
 * Toggle a value's membership in a `Set`, returning a new set rather than
 * mutating in place — the add/remove flip shared by every checkbox-like id
 * set backed by `useState<ReadonlySet<T>>` (directory-collapse, the large-file
 * "Load diff" reveal, and similar).
 */
export function toggleInSet<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}
