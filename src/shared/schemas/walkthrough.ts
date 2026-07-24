/**
 * The walkthrough schemas — `docent/walkthrough` (the manifest) and
 * `docent/walkthrough-section` (one section), plus the product-only `Capture`
 * registry entry (walkthroughs.md §4, §5, §6). Runtime-neutral: no Bun or DOM
 * globals, so the server (which parses these files off disk) and the client
 * (which renders and drifts them) share one definition.
 *
 * The manifest is `kind`-discriminated and a section swaps its targets by kind
 * (walkthroughs.md §2): the **code** arm folds a `WalkthroughRange` — the same
 * coordinate as the `line` anchor arm — and the **product** arm folds
 * captures/annotations. The pure folds over these shapes live beside this in
 * `lib/walkthrough.ts`.
 */

import { Schema } from "effect";

import { captureKinds } from "../enums/capture-kind";
import { sides } from "../enums/side";
import { walkthroughKinds } from "../enums/walkthrough-kind";
import { Anchor } from "./finding";
import { CaptureId, ChangeId, SectionId, WalkthroughId } from "./ids";

/** A code range: the same coordinate as the `line` anchor arm (walkthroughs.md §5). */
export class WalkthroughRange extends Schema.Class<WalkthroughRange>(
  "WalkthroughRange"
)({
  blobSha: Schema.String,
  file: Schema.String,
  /** 1-based inclusive `[start, end]`, matching the `line` arm. */
  lines: Schema.Tuple([Schema.Number, Schema.Number]),
  side: Schema.Literals(sides),
}) {}

/**
 * One authored callout on a product section (walkthroughs.md §7): a body plus an
 * anchor drawn from the full Finding anchor union (reused here, deliberately not
 * narrowed to capture arms). A capture arm pins onto its capture; every other
 * arm renders as a section-level note, so any arm an author writes surfaces
 * rather than being dropped (§7's rendering contract). Durable, not a thread,
 * not resolvable — the annotation lives in the section, distinct from a Finding.
 */
export class WalkthroughAnnotation extends Schema.Class<WalkthroughAnnotation>(
  "WalkthroughAnnotation"
)({
  anchor: Anchor,
  body: Schema.String,
}) {}

/**
 * `docent/walkthrough-section` — one step of the tour: a titled unit of prose
 * interleaved with its targets (walkthroughs.md §5). `body` is lifted from the
 * markdown after the frontmatter at parse time (the same envelope split as a
 * Finding record). `ranges` is the code arm; `captures`/`annotations` are the
 * product arm — a section carries the arm for its walkthrough's `kind`.
 */
export class WalkthroughSection extends Schema.Class<WalkthroughSection>(
  "WalkthroughSection"
)({
  /** Product arm: authored callouts pinned to captures/recordings/prose (§7). */
  annotations: Schema.optional(Schema.Array(WalkthroughAnnotation)),
  body: Schema.String,
  /** Product arm: the `cap_*` ids this section embeds, in `{{capture:i}}` order. */
  captures: Schema.optional(Schema.Array(CaptureId)),
  id: SectionId,
  ranges: Schema.optional(Schema.Array(WalkthroughRange)),
  schema: Schema.Literal("docent/walkthrough-section"),
  title: Schema.String,
}) {}

/**
 * `docent/walkthrough`'s product-only `captures[]` registry entry
 * (walkthroughs.md §6): one atomic media artifact — a screenshot or a
 * recording. Both are rrweb event streams, so `media` is a content sha
 * addressing the blob at `captures/<sha>.rrweb.json`; a screenshot holds the
 * `[Meta, FullSnapshot]` pair alone, a recording the whole stream. `dims` rides
 * screenshots (full-page CSS pixels, which is the document the snapshot holds
 * rather than the `viewport` window onto it) and `durationMs` rides recordings.
 * Born against the walkthrough's `bornChangeId`, so no per-capture ref.
 *
 * `title` is a short descriptive name the driver gives the state it captured
 * ("Empty palette on load") — the label the Review shows in place of the
 * generic "Screenshot 1" / "Recording 1". Optional: an untitled capture falls
 * back to its ordinal, so hand-authored and older registries still read.
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

/**
 * `docent/walkthrough` — the manifest. `sections` is the ordered list of
 * section filenames; **array position IS the order** (walkthroughs.md §4). The
 * product-only `captures` registry is validated (walkthroughs.md §6); code
 * manifests omit it and the code tab never reads it.
 */
export class Walkthrough extends Schema.Class<Walkthrough>("Walkthrough")({
  bornChangeId: ChangeId,
  captures: Schema.optional(Schema.Array(Capture)),
  id: WalkthroughId,
  kind: Schema.Literals(walkthroughKinds),
  schema: Schema.Literal("docent/walkthrough"),
  sections: Schema.Array(Schema.String),
  title: Schema.String,
}) {}
