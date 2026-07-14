/**
 * The Finding record schema (`docent/finding`) and the anchor vocabulary it
 * carries. Runtime-neutral: no Bun or DOM globals, so the server (which parses
 * record files off disk) and the client (which folds and renders) share one
 * definition.
 *
 * The read-time fold that turns a Finding's append-only record directory into
 * the shape the panel renders lives beside this in `lib/finding.ts`.
 */

import { Schema } from "effect";

/** Attribution carried by every record (data-model.md §5.4). */
export class Author extends Schema.Class<Author>("Author")({
  display: Schema.String,
  /** Stable machine handle — git email or agent slug. */
  id: Schema.String,
  /** The load-bearing axis: human vs. agent. */
  kind: Schema.Literals(["human", "agent"]),
  /** Optional agent metadata. */
  model: Schema.optional(Schema.String),
}) {}

// The anchor union (data-model.md §5.3): seven arms across the three pillars,
// discriminated by `kind`. Carried on the root (open) record only. The kind
// values are named once here so the schema and every fold read the same token.
export const ANCHOR_KIND = {
  change: "change",
  file: "file",
  line: "line",
  recordingTimestamp: "recording-timestamp",
  screenshotRegion: "screenshot-region",
  textSpan: "text-span",
  walkthroughSection: "walkthrough-section",
} as const;

const Side = Schema.Literals(["base", "head"]);
const ChangeAnchor = Schema.Struct({
  kind: Schema.Literal(ANCHOR_KIND.change),
});
const FileAnchor = Schema.Struct({
  blobSha: Schema.String,
  file: Schema.String,
  kind: Schema.Literal(ANCHOR_KIND.file),
  side: Side,
});
const LineAnchor = Schema.Struct({
  blobSha: Schema.String,
  file: Schema.String,
  kind: Schema.Literal(ANCHOR_KIND.line),
  lines: Schema.Tuple([Schema.Number, Schema.Number]),
  side: Side,
});
const WalkthroughSectionAnchor = Schema.Struct({
  kind: Schema.Literal(ANCHOR_KIND.walkthroughSection),
  sectionId: Schema.String,
  walkthroughId: Schema.String,
});
const ScreenshotRegionAnchor = Schema.Struct({
  capture: Schema.String,
  kind: Schema.Literal(ANCHOR_KIND.screenshotRegion),
  rect: Schema.optional(
    Schema.Tuple([Schema.Number, Schema.Number, Schema.Number, Schema.Number])
  ),
});
const RecordingTimestampAnchor = Schema.Struct({
  capture: Schema.String,
  fromMs: Schema.optional(Schema.Number),
  kind: Schema.Literal(ANCHOR_KIND.recordingTimestamp),
  toMs: Schema.optional(Schema.Number),
});
const TextSpanAnchor = Schema.Struct({
  kind: Schema.Literal(ANCHOR_KIND.textSpan),
  prefix: Schema.optional(Schema.String),
  quote: Schema.String,
  section: Schema.String,
  suffix: Schema.optional(Schema.String),
});

export const Anchor = Schema.Union([
  ChangeAnchor,
  FileAnchor,
  LineAnchor,
  WalkthroughSectionAnchor,
  ScreenshotRegionAnchor,
  RecordingTimestampAnchor,
  TextSpanAnchor,
]);
export type Anchor = typeof Anchor.Type;

/**
 * The record types, derived from the `NNN-<type>.md` filename. Two kinds:
 * `open`, `reply`, and `edit` carry prose; `action`, `resolve`, and `reopen`
 * carry none and exist only to move the Finding's status.
 */
export const RECORD_TYPES = [
  "open",
  "reply",
  "action",
  "resolve",
  "reopen",
  "edit",
] as const;
export const RecordType = Schema.Literals(RECORD_TYPES);
export type RecordType = typeof RecordType.Type;

/**
 * One parsed record: the `NNN-<type>.md` filename plus its frontmatter envelope
 * and markdown body. `anchor` rides the root (open) record; `edits` names the
 * record an edit supersedes (its filename) — the append-only equivalent of an
 * in-place body edit.
 */
export class FindingRecord extends Schema.Class<FindingRecord>("FindingRecord")(
  {
    anchor: Schema.optional(Anchor),
    author: Author,
    body: Schema.String,
    changeId: Schema.String,
    createdAt: Schema.String,
    edits: Schema.optional(Schema.String),
    /** The record's filename, e.g. `002-reply.md` — orders the log and is the edit target. */
    name: Schema.String,
    /** The envelope discriminant; a record without it fails to decode and is skipped. */
    schema: Schema.Literal("docent/finding"),
    type: RecordType,
  }
) {}
