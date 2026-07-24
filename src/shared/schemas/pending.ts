/** A read-only preview of the dirty working tree — not a Change: no identity, no persistence. */

import { Schema } from "effect";

import { pendingRanges } from "../enums/pending-range";

const PendingRange = Schema.Literals(pendingRanges);

export class Pending extends Schema.Class<Pending>("Pending")({
  /** Merge-base of default branch and head — the `cumulative` base side. */
  baseSha: Schema.String,
  /** Checked-out branch, or "HEAD" when detached. */
  branch: Schema.String,
  dirty: Schema.Boolean,
  /** Current HEAD — the `incremental` base side. */
  headSha: Schema.String,
  /** Staged + unstaged combined, with untracked files appended as full-file adds; empty when the working tree is clean. */
  patch: Schema.String,
  range: PendingRange,
  root: Schema.String,
}) {}
