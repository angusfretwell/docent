/**
 * The two selectable ranges of the Pending preview (diff-review.md §6):
 * - `incremental` — `git diff HEAD`: just the pending edit since the last
 *   commit (the surgical view; empties the moment HEAD moves).
 * - `cumulative` — `base..worktree`: the whole current Change plus uncommitted
 *   edits, previewing the next Change's full diff.
 */
export const PendingRange = {
  Cumulative: "cumulative",
  Incremental: "incremental",
} as const;

export type PendingRange = (typeof PendingRange)[keyof typeof PendingRange];

export const pendingRanges = Object.values(PendingRange);
