/**
 * The `GET /api/pending` wire shapes, shared by the Bun server (producer) and
 * the browser client (consumer). Runtime-neutral: no Bun or DOM globals here.
 *
 * The Pending entry is a read-only preview of the dirty working tree — a
 * Change-shaped view whose head side is the live working tree, not a committed
 * SHA (docs/spec/diff-review.md §6). It is not a Change: no identity, no
 * persistence. The shape is resolved live from git per request; on commit the
 * incremental patch empties and the entry hides — Pending owns no lifecycle.
 */

import { Schema } from "effect";

import { pendingRanges } from "../enums/pending-range";

// The range value set is named once in `enums/pending-range.ts`.
const PendingRange = Schema.Literals(pendingRanges);

export class Pending extends Schema.Class<Pending>("Pending")({
  /** Merge-base of the default branch and head — the `cumulative` base side. */
  baseSha: Schema.String,
  /** Checked-out branch name, or "HEAD" when detached. */
  branch: Schema.String,
  /** Whether the working tree is dirty; drives auto-surface / auto-hide. */
  dirty: Schema.Boolean,
  /** Current HEAD — the `incremental` base side. */
  headSha: Schema.String,
  /**
   * The pending patch for `range`: staged + unstaged combined (`git diff`
   * treats the index as an invisible detail), with untracked files appended as
   * full-file adds. Empty when the working tree is clean.
   */
  patch: Schema.String,
  /** Which range this patch covers. */
  range: PendingRange,
  /** Absolute repo root (git rev-parse --show-toplevel). */
  root: Schema.String,
}) {}
