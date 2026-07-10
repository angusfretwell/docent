/**
 * The walkthrough schemas — `docent/walkthrough@2` (the manifest) and
 * `docent/walkthrough-section@2` (one section) — plus the pure reads the Code
 * walkthrough tab folds over them (walkthroughs.md §4, §5, §8). Runtime-neutral:
 * no Bun or DOM globals, so the server (which parses these files off disk) and
 * the client (which renders and drifts them) share one definition, and every
 * fold below is a plain unit-tested function.
 *
 * This module owns the **code** arm. The manifest is `kind`-discriminated and a
 * section swaps its targets by kind (walkthroughs.md §2); the product arm
 * (`captures`/`annotations`) is carried through but not folded here — it is a
 * separate tab's concern. A range is `{ file, side, blobSha, lines }`, the same
 * coordinate as the `line` anchor arm, so drift is the Finding re-anchor reused
 * verbatim (walkthroughs.md §5, §8; no second algorithm).
 */

import { Schema } from "effect";
import type { Anchor } from "./finding.ts";
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
 * `docent/walkthrough-section@2` — one step of the tour: a titled unit of prose
 * interleaved with its targets (walkthroughs.md §5). `body` is lifted from the
 * markdown after the frontmatter at parse time (the same envelope split as a
 * Finding record). `ranges` is the code arm; a product section carries none.
 */
export class WalkthroughSection extends Schema.Class<WalkthroughSection>("WalkthroughSection")({
  body: Schema.String,
  id: Schema.String,
  ranges: Schema.optional(Schema.Array(WalkthroughRange)),
  schema: Schema.Literal("docent/walkthrough-section@2"),
  title: Schema.String,
}) {}

/**
 * `docent/walkthrough@2` — the manifest. `sections` is the ordered list of
 * section filenames; **array position IS the order** (walkthroughs.md §4). The
 * product-only `captures` registry is carried opaquely so a product manifest
 * still decodes; the code tab never reads it.
 */
export class Walkthrough extends Schema.Class<Walkthrough>("Walkthrough")({
  bornChangeId: Schema.String,
  captures: Schema.optional(Schema.Array(Schema.Unknown)),
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

/** One placed piece of a section body: a run of prose, or a target range by index. */
export type Segment = { kind: "prose"; text: string } | { kind: "range"; index: number };

// A literate `{{range:i}}` marker; `i` is a position in the frontmatter list.
const RANGE_MARKER = /\{\{range:(?<index>\d+)\}\}/g;

/**
 * Fold a section body into its rendered segments (walkthroughs.md §5):
 *
 * - **No valid markers ⇒** the prose, then every range in index order (the flat
 *   fallback).
 * - **Markers present ⇒** prose and ranges interleave in document order; a
 *   marker whose index is out of range stays literal prose; any range left
 *   unreferenced appends after, in index order, so no target is silently
 *   dropped.
 *
 * Prose runs are trimmed and empty runs elided, so adjacent markers don't emit
 * blank prose between them.
 */
export function interleaveSegments(body: string, rangeCount: number): Segment[] {
  const segments: Segment[] = [];
  const referenced = new Set<number>();
  let cursor = 0;

  function pushProse(raw: string) {
    const text = raw.trim();
    if (text !== "") {
      segments.push({ kind: "prose", text });
    }
  }

  RANGE_MARKER.lastIndex = 0;
  for (let match = RANGE_MARKER.exec(body); match !== null; match = RANGE_MARKER.exec(body)) {
    const index = Number(match.groups?.index);
    if (index >= rangeCount) {
      // Out of range: leave the marker text in place as literal prose.
      continue;
    }
    pushProse(body.slice(cursor, match.index));
    segments.push({ index, kind: "range" });
    referenced.add(index);
    cursor = match.index + match[0].length;
  }
  pushProse(body.slice(cursor));

  // No marker placed any range: prose already pushed, append every range.
  if (referenced.size === 0) {
    for (let index = 0; index < rangeCount; index += 1) {
      segments.push({ index, kind: "range" });
    }
    return segments;
  }

  // Some ranges went unreferenced: append them after, in index order.
  for (let index = 0; index < rangeCount; index += 1) {
    if (!referenced.has(index)) {
      segments.push({ index, kind: "range" });
    }
  }
  return segments;
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
 * The walkthrough the code tab shows: the newest code walkthrough by id. Ids are
 * ULID-shaped, so the lexically-greatest id is the most recently minted — the
 * "one walkthrough per Change per pillar" the tab renders (walkthroughs.md §2).
 */
export function latestCodeWalkthrough<T extends { id: string; kind: "code" | "product" }>(
  entries: readonly T[],
): T | undefined {
  let latest: T | undefined;
  for (const entry of entries) {
    if (entry.kind === "code" && (latest === undefined || entry.id > latest.id)) {
      latest = entry;
    }
  }
  return latest;
}

/**
 * Identity drift for a `walkthrough-section` Finding (walkthroughs.md §8): live
 * while the section still exists in its (immutable) walkthrough, outdated once
 * gone — no `shifted`, since a whole section has no line-number movement.
 */
export function sectionPresent(sectionId: string, sections: readonly { id: string }[]): boolean {
  return sections.some((section) => section.id === sectionId);
}
