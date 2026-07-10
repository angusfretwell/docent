/**
 * The `GET /api/diff` wire shape, shared by the Bun server (producer) and the
 * browser client (consumer). Runtime-neutral: no Bun or DOM globals here.
 */
export interface RepoDiff {
  /** Merge-base of the default branch and head — three-dot semantics. */
  baseSha: string;
  /** Checked-out branch name, or "HEAD" when detached. */
  branch: string;
  /** Name of the repo's default branch (e.g. "main"). */
  defaultBranch: string;
  headSha: string;
  /** `git diff baseSha..headSha`; empty when head is the default branch. */
  patch: string;
  /** Absolute repo root (git rev-parse --show-toplevel). */
  root: string;
}
