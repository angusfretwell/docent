import { Schema } from "effect";

import { captureKinds } from "../enums/capture-kind";
import { sides } from "../enums/side";
import { walkthroughKinds } from "../enums/walkthrough-kind";
import { Anchor } from "./comment";
import { CaptureId, ChangeId, SectionId, WalkthroughId } from "./ids";

/** Same coordinate as the `line` anchor arm. */
export class WalkthroughRange extends Schema.Class<WalkthroughRange>(
  "WalkthroughRange"
)({
  blobSha: Schema.String,
  file: Schema.String,
  /** 1-based inclusive `[start, end]`. */
  lines: Schema.Tuple([Schema.Number, Schema.Number]),
  side: Schema.Literals(sides),
}) {}

/** Anchor reuses the full Comment union, deliberately not narrowed to capture arms — any arm an author writes still renders. Not a resolvable thread. */
export class WalkthroughAnnotation extends Schema.Class<WalkthroughAnnotation>(
  "WalkthroughAnnotation"
)({
  anchor: Anchor,
  body: Schema.String,
}) {}

export class WalkthroughSection extends Schema.Class<WalkthroughSection>(
  "WalkthroughSection"
)({
  /** Product arm: authored callouts. */
  annotations: Schema.optional(Schema.Array(WalkthroughAnnotation)),
  body: Schema.String,
  /** Product arm: `cap_*` ids in `{{capture:i}}` order. */
  captures: Schema.optional(Schema.Array(CaptureId)),
  id: SectionId,
  ranges: Schema.optional(Schema.Array(WalkthroughRange)),
  schema: Schema.Literal("docent/walkthrough-section"),
  title: Schema.String,
}) {}

/**
 * `media` is a content sha addressing `captures/<sha>.rrweb.json` (both kinds are
 * rrweb streams). `dims` rides screenshots, `durationMs` rides recordings.
 */
export class Capture extends Schema.Class<Capture>("Capture")({
  dims: Schema.optional(Schema.Tuple([Schema.Number, Schema.Number])),
  durationMs: Schema.optional(Schema.Number),
  id: CaptureId,
  kind: Schema.Literals(captureKinds),
  media: Schema.String,
  route: Schema.String,
  title: Schema.optional(Schema.String),
  viewport: Schema.Tuple([Schema.Number, Schema.Number]),
}) {}

/** `sections` lists section filenames; array position IS the tour order. `captures` is product-only. */
export class Walkthrough extends Schema.Class<Walkthrough>("Walkthrough")({
  bornChangeId: ChangeId,
  captures: Schema.optional(Schema.Array(Capture)),
  id: WalkthroughId,
  kind: Schema.Literals(walkthroughKinds),
  schema: Schema.Literal("docent/walkthrough"),
  sections: Schema.Array(Schema.String),
  title: Schema.String,
}) {}
