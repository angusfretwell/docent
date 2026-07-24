import { Schema } from "effect";

export class Change extends Schema.Class<Change>("Change")({
  /** Merge-base of default branch and head (three-dot). */
  baseSha: Schema.String,
  /** Checked-out branch, or "HEAD" when detached. */
  branch: Schema.String,
  defaultBranch: Schema.String,
  /** Changed paths marked linguist-generated or -vendored in .gitattributes. */
  generated: Schema.Array(Schema.String),
  headSha: Schema.String,
  /** `git diff baseSha..headSha`; empty when head is the default branch. */
  patch: Schema.String,
  /** origin remote as a browsable https URL, or null when the repo has no origin. */
  remoteUrl: Schema.NullOr(Schema.String),
  root: Schema.String,
}) {}

export const DiffError = Schema.Struct({ error: Schema.String });
