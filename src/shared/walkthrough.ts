/**
 * The walkthrough schemas — `docent/walkthrough@2` (the manifest) and
 * `docent/walkthrough-section@2` (one section) — plus the pure reads the Code
 * walkthrough tab folds over them (walkthroughs.md §4, §5, §8). Runtime-neutral:
 * no Bun or DOM globals, so the server (which parses these files off disk) and
 * the client (which renders and drifts them) share one definition, and every
 * fold below is a plain unit-tested function.
 *
 * The manifest is `kind`-discriminated and a section swaps its targets by kind
 * (walkthroughs.md §2). The **code** arm folds a range — `{ file, side, blobSha,
 * lines }`, the same coordinate as the `line` anchor arm, so drift is the Finding
 * re-anchor reused verbatim (§5, §8; no second algorithm). The **product** arm
 * folds captures/annotations: the `{{capture:i}}` interleave, `captureById`, and
 * identity-based drift (`identityDrift` — live/outdated, no shifted, §8), each a
 * plain unit-tested function the Product tab renders over.
 */

import { Schema } from "effect";
import { Anchor } from "./finding.ts";
import type { DriftState } from "./drift.ts";

/** A code range: the same coordinate as the `line` anchor arm (walkthroughs.md §5). */
export class WalkthroughRange extends Schema.Class<WalkthroughRange>("WalkthroughRange")({
  blobSha: Schema.String,
  file: Schema.String,
  /** 1-based inclusive `[start, end]`, matching the `line` arm. */
  lines: Schema.Tuple([Schema.Number, Schema.Number]),
  side: Schema.Literals(["base", "head"]),
}) {}

/**
 * One authored callout on a product section (walkthroughs.md §7): a body pinned
 * to a capture-region / recording-timestamp / text-span anchor (the same anchor
 * vocabulary Findings use, reused here). Durable, not a thread, not resolvable —
 * the annotation lives in the section, distinct from a Finding.
 */
export class WalkthroughAnnotation extends Schema.Class<WalkthroughAnnotation>(
  "WalkthroughAnnotation",
)({
  anchor: Anchor,
  body: Schema.String,
}) {}

/**
 * `docent/walkthrough-section@2` — one step of the tour: a titled unit of prose
 * interleaved with its targets (walkthroughs.md §5). `body` is lifted from the
 * markdown after the frontmatter at parse time (the same envelope split as a
 * Finding record). `ranges` is the code arm; `captures`/`annotations` are the
 * product arm — a section carries the arm for its walkthrough's `kind`.
 */
export class WalkthroughSection extends Schema.Class<WalkthroughSection>("WalkthroughSection")({
  /** Product arm: authored callouts pinned to captures/recordings/prose (§7). */
  annotations: Schema.optional(Schema.Array(WalkthroughAnnotation)),
  body: Schema.String,
  /** Product arm: the `cap_*` ids this section embeds, in `{{capture:i}}` order. */
  captures: Schema.optional(Schema.Array(Schema.String)),
  id: Schema.String,
  ranges: Schema.optional(Schema.Array(WalkthroughRange)),
  schema: Schema.Literal("docent/walkthrough-section@2"),
  title: Schema.String,
}) {}

/**
 * `docent/walkthrough@2`'s product-only `captures[]` registry entry
 * (walkthroughs.md §6): one atomic media artifact — a screenshot or a
 * recording. `media` is a content sha addressing the blob at
 * `captures/<sha>.png` / `captures/<sha>.rrweb.json`; `dims` rides screenshots
 * (full-page pixels) and `durationMs` rides recordings. Born against the
 * walkthrough's `bornChangeId`, so no per-capture ref.
 */
export class Capture extends Schema.Class<Capture>("Capture")({
  dims: Schema.optional(Schema.Tuple([Schema.Number, Schema.Number])),
  durationMs: Schema.optional(Schema.Number),
  id: Schema.String,
  kind: Schema.Literals(["screenshot", "recording"]),
  media: Schema.String,
  route: Schema.String,
  viewport: Schema.Tuple([Schema.Number, Schema.Number]),
}) {}

/**
 * `docent/walkthrough@2` — the manifest. `sections` is the ordered list of
 * section filenames; **array position IS the order** (walkthroughs.md §4). The
 * product-only `captures` registry is validated (walkthroughs.md §6); code
 * manifests omit it and the code tab never reads it.
 */
export class Walkthrough extends Schema.Class<Walkthrough>("Walkthrough")({
  bornChangeId: Schema.String,
  captures: Schema.optional(Schema.Array(Capture)),
  id: Schema.String,
  kind: Schema.Literals(["code", "product"]),
  schema: Schema.Literal("docent/walkthrough@2"),
  sections: Schema.Array(Schema.String),
  title: Schema.String,
}) {}

/**
 * Lift a range into the `line` anchor arm — verbatim, so the Finding drift
 * machinery (`planDrift`/`reanchorRange`) re-anchors a range with no second
 * algorithm (walkthroughs.md §8). A range is a `line` anchor minus its `kind`.
 */
export function rangeAnchor(range: WalkthroughRange): Extract<Anchor, { kind: "line" }> {
  return {
    blobSha: range.blobSha,
    file: range.file,
    kind: "line",
    lines: [range.lines[0], range.lines[1]],
    side: range.side,
  };
}

/**
 * One placed piece of a section body: a run of prose, or a target by index — a
 * code `range` or a product `capture`. The target kind mirrors the section kind;
 * a section only ever emits one target kind.
 */
export type Segment =
  | { kind: "prose"; text: string }
  | { kind: "range"; index: number }
  | { kind: "capture"; index: number };

// The literate `{{range:i}}` / `{{capture:i}}` markers; `i` is a position in the
// frontmatter target list. Global so `exec` walks every occurrence.
const RANGE_MARKER = /\{\{range:(?<index>\d+)\}\}/g;
const CAPTURE_MARKER = /\{\{capture:(?<index>\d+)\}\}/g;

/**
 * Fold a section body into its rendered segments against one marker kind
 * (walkthroughs.md §5):
 *
 * - **No valid markers ⇒** the prose, then every target in index order (the flat
 *   fallback).
 * - **Markers present ⇒** prose and targets interleave in document order; a
 *   marker whose index is out of range stays literal prose; any target left
 *   unreferenced appends after, in index order, so no target is silently
 *   dropped.
 *
 * Prose runs are trimmed and empty runs elided, so adjacent markers don't emit
 * blank prose between them. The other kind's marker is inert here — it isn't
 * matched, so it survives as literal prose (a `{{capture:i}}` in a code body, or
 * vice versa, is never a target).
 */
function interleave(
  body: string,
  count: number,
  marker: RegExp,
  targetKind: "range" | "capture",
): Segment[] {
  const segments: Segment[] = [];
  const referenced = new Set<number>();
  let cursor = 0;

  function pushProse(raw: string) {
    const text = raw.trim();
    if (text !== "") {
      segments.push({ kind: "prose", text });
    }
  }
  function pushTarget(index: number) {
    segments.push(targetKind === "range" ? { index, kind: "range" } : { index, kind: "capture" });
  }

  marker.lastIndex = 0;
  for (let match = marker.exec(body); match !== null; match = marker.exec(body)) {
    const index = Number(match.groups?.index);
    if (index >= count) {
      // Out of range: leave the marker text in place as literal prose.
      continue;
    }
    pushProse(body.slice(cursor, match.index));
    pushTarget(index);
    referenced.add(index);
    cursor = match.index + match[0].length;
  }
  pushProse(body.slice(cursor));

  // No marker placed any target: prose already pushed, append every target.
  if (referenced.size === 0) {
    for (let index = 0; index < count; index += 1) {
      pushTarget(index);
    }
    return segments;
  }

  // Some targets went unreferenced: append them after, in index order.
  for (let index = 0; index < count; index += 1) {
    if (!referenced.has(index)) {
      pushTarget(index);
    }
  }
  return segments;
}

/** Fold a code section body over its `{{range:i}}` markers (walkthroughs.md §5). */
export function interleaveSegments(body: string, rangeCount: number): Segment[] {
  return interleave(body, rangeCount, RANGE_MARKER, "range");
}

/** Fold a product section body over its `{{capture:i}}` markers (walkthroughs.md §5). */
export function interleaveCaptureSegments(body: string, captureCount: number): Segment[] {
  return interleave(body, captureCount, CAPTURE_MARKER, "capture");
}

// Worst-of ordering for the section rollup: outdated dominates shifted dominates
// live (walkthroughs.md §8).
const DRIFT_RANK: Record<DriftState, number> = { live: 0, outdated: 2, shifted: 1 };

/**
 * The section's drift badge is the **worst-of rollup** of its ranges
 * (walkthroughs.md §8). A not-yet-computed range (undefined) reads as live, so
 * the rollup only ever escalates as re-anchors resolve — it never flashes a
 * worse state than the evidence supports.
 */
export function rollupDrift(states: readonly (DriftState | undefined)[]): DriftState {
  let worst: DriftState = "live";
  for (const state of states) {
    if (state !== undefined && DRIFT_RANK[state] > DRIFT_RANK[worst]) {
      worst = state;
    }
  }
  return worst;
}

/** A walkthrough's standing against the newest Change: how many Changes behind its birth. */
export interface Staleness {
  behind: number;
  stale: boolean;
}

/**
 * Walkthrough staleness = `bornChangeId` vs the current head (walkthroughs.md
 * §8) — a per-walkthrough signal surfaced, never hidden. `behind` counts the
 * Changes minted since the tour was born; an unknown born Change reads as
 * maximally stale (born before every Change we hold). `changes` is in mint
 * order (`chg_001`, `chg_002`, …), the newest last.
 */
export function walkthroughStaleness(
  bornChangeId: string,
  changes: readonly { id: string }[],
): Staleness {
  if (changes.length === 0) {
    return { behind: 0, stale: false };
  }
  const bornIndex = changes.findIndex((change) => change.id === bornChangeId);
  const behind = bornIndex === -1 ? changes.length : changes.length - 1 - bornIndex;
  return { behind, stale: behind > 0 };
}

/**
 * The walkthrough a pillar tab shows: the newest entry of `kind` by id. Ids are
 * ULID-shaped, so the lexically-greatest id is the most recently minted — the
 * "one walkthrough per Change per pillar" a tab renders (walkthroughs.md §2).
 */
function latestWalkthrough<T extends { id: string; kind: "code" | "product" }>(
  entries: readonly T[],
  kind: "code" | "product",
): T | undefined {
  let latest: T | undefined;
  for (const entry of entries) {
    if (entry.kind === kind && (latest === undefined || entry.id > latest.id)) {
      latest = entry;
    }
  }
  return latest;
}

/** The newest **code** walkthrough — the one the Code walkthrough tab renders. */
export function latestCodeWalkthrough<T extends { id: string; kind: "code" | "product" }>(
  entries: readonly T[],
): T | undefined {
  return latestWalkthrough(entries, "code");
}

/** The newest **product** walkthrough — the one the Product walkthrough tab renders. */
export function latestProductWalkthrough<T extends { id: string; kind: "code" | "product" }>(
  entries: readonly T[],
): T | undefined {
  return latestWalkthrough(entries, "product");
}

/**
 * Identity-based capture/section drift (walkthroughs.md §8). Product has **no
 * blob-to-blob re-anchor and no `shifted`**: a capture or section anchor is
 * `live` while its target still exists in the (immutable) shown walkthrough, and
 * `outdated` once superseded — then it detaches and renders against its born
 * capture. The caller decides presence (a set-membership check); this pins the
 * live/outdated mapping in one place.
 */
export function identityDrift(present: boolean): DriftState {
  return present ? "live" : "outdated";
}

/** Look one capture up in a manifest's `captures[]` registry by id (walkthroughs.md §6). */
export function captureById(
  manifest: { captures?: readonly Capture[] } | undefined,
  captureId: string,
): Capture | undefined {
  return manifest?.captures?.find((capture) => capture.id === captureId);
}
