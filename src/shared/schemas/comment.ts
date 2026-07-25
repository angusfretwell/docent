import { Schema } from "effect";

import { ANCHOR_KIND } from "../enums/anchor-kind";
import { recordTypes } from "../enums/record-type";
import { sides } from "../enums/side";
import { CaptureId, ChangeId, SectionId, WalkthroughId } from "./ids";

export class Author extends Schema.Class<Author>("Author")({
  display: Schema.String,
  id: Schema.String,
  kind: Schema.Literals(["human", "agent"]),
  model: Schema.optional(Schema.String),
}) {}

const Side = Schema.Literals(sides);
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
  sectionId: SectionId,
  walkthroughId: WalkthroughId,
});
const ScreenshotRegionAnchor = Schema.Struct({
  capture: CaptureId,
  kind: Schema.Literal(ANCHOR_KIND.screenshotRegion),
  rect: Schema.optional(
    Schema.Tuple([Schema.Number, Schema.Number, Schema.Number, Schema.Number])
  ),
});
const RecordingTimestampAnchor = Schema.Struct({
  capture: CaptureId,
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

const RecordType = Schema.Literals(recordTypes);

export class CommentRecord extends Schema.Class<CommentRecord>("CommentRecord")(
  {
    anchor: Schema.optional(Anchor),
    author: Author,
    body: Schema.String,
    changeId: ChangeId,
    createdAt: Schema.String,
    /** The record's filename (e.g. `002-reply.md`); its lexical order is the log order. */
    name: Schema.String,
    /** Envelope discriminant; a record missing it fails to decode and is skipped. */
    schema: Schema.Literal("docent/comment"),
    type: RecordType,
  }
) {}
