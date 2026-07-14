/**
 * The `GET /api/diff` wire shapes, shared by the Bun server (producer) and the
 * browser client (consumer). Runtime-neutral: no Bun or DOM globals here.
 *
 * Named per CONTEXT.md: a Change is identified by its resolved
 * `(baseSha, headSha)` with `base` at the merge-base. Nothing is minted or
 * persisted in this slice — the shape is resolved live from git per request.
 */

import { Schema } from "effect";

export class Change extends Schema.Class<Change>("Change")({
  /** Merge-base of the default branch and head — three-dot semantics. */
  baseSha: Schema.String,
  /** Checked-out branch name, or "HEAD" when detached. */
  branch: Schema.String,
  /** Name of the repo's default branch (e.g. "main"). */
  defaultBranch: Schema.String,
  /**
   * Changed paths that `.gitattributes` marks `linguist-generated` or
   * `linguist-vendored` — the server half of generated-file detection
   * (diff-review.md §5). The client unions this with its default glob set to
   * de-emphasize and auto-mark-viewed generated files.
   */
  generated: Schema.Array(Schema.String),
  headSha: Schema.String,
  /** `git diff baseSha..headSha`; empty when head is the default branch. */
  patch: Schema.String,
  /**
   * The `origin` remote as a browsable https URL (SSH/scp forms normalized,
   * `.git` stripped), or null when the repo has no origin. The client links
   * the branch to `${remoteUrl}/pull/${branch}` — GitHub redirects that to
   * the branch's PR; other hosts may 404, which is accepted.
   */
  remoteUrl: Schema.NullOr(Schema.String),
  /** Absolute repo root (git rev-parse --show-toplevel). */
  root: Schema.String,
}) {}

/** The `GET /api/diff` failure body (HTTP 500). */
export const DiffError = Schema.Struct({ error: Schema.String });
