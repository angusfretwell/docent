/**
 * The remaining pure folds the Code and Product walkthrough tabs run over their
 * manifests and sections (walkthroughs.md §4, §5, §8) — everything outside the
 * prose interleave (`walkthrough-segments`) and the identity-drift plan
 * (`identity-drift`). Runtime-neutral: no Bun or DOM globals, so the server and
 * the client share one definition and each fold is a plain unit-tested function.
 * The walkthrough schemas themselves live in `schemas/walkthrough.ts`.
 *
 * Covered here: lifting a `range` into the `line` anchor arm so the Finding drift
 * machinery re-anchors it verbatim (`rangeAnchor`); the worst-of section drift
 * rollup (`rollupDrift`); per-walkthrough staleness (`walkthroughStaleness`); the
 * capture registry lookup (`captureById`); and folding a product section's
 * annotations into the surfaces that render them (`foldSectionAnnotations`).
 */

import { ANCHOR_KIND } from "../enums/anchor-kind";
import type { DriftState } from "../enums/drift-state";
import type { Anchor } from "../schemas/finding";
import type {
  Capture,
  WalkthroughAnnotation,
  WalkthroughRange,
} from "../schemas/walkthrough";
import { findingLocation } from "./finding";

/**
 * Lift a range into the `line` anchor arm — verbatim, so the Finding drift
 * machinery (`planDrift`/`reanchorRange`) re-anchors a range with no second
 * algorithm (walkthroughs.md §8). A range is a `line` anchor minus its `kind`.
 */
export function rangeAnchor(
  range: WalkthroughRange
): Extract<Anchor, { kind: "line" }> {
  return {
    blobSha: range.blobSha,
    file: range.file,
    kind: "line",
    lines: [range.lines[0], range.lines[1]],
    side: range.side,
  };
}

// Worst-of ordering for the section rollup: outdated dominates shifted dominates
// live (walkthroughs.md §8).
const DRIFT_RANK: Record<DriftState, number> = {
  live: 0,
  outdated: 2,
  shifted: 1,
};

/**
 * The section's drift badge is the **worst-of rollup** of its ranges
 * (walkthroughs.md §8). A not-yet-computed range (undefined) reads as live, so
 * the rollup only ever escalates as re-anchors resolve — it never flashes a
 * worse state than the evidence supports.
 */
export function rollupDrift(
  states: readonly (DriftState | undefined)[]
): DriftState {
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
  changes: readonly { id: string }[]
): Staleness {
  if (changes.length === 0) {
    return { behind: 0, stale: false };
  }
  const bornIndex = changes.findIndex((change) => change.id === bornChangeId);
  const behind =
    bornIndex === -1 ? changes.length : changes.length - 1 - bornIndex;
  return { behind, stale: behind > 0 };
}

/** Look one capture up in a manifest's `captures[]` registry by id (walkthroughs.md §6). */
export function captureById(
  manifest: { captures?: readonly Capture[] } | undefined,
  captureId: string
): Capture | undefined {
  return manifest?.captures?.find((capture) => capture.id === captureId);
}

/** A non-capture annotation surfaced as a section-level note, its anchor read as a location. */
export interface AnnotationNote {
  body: string;
  location: string;
}

/** A product section's annotations folded into the surfaces that render them (walkthroughs.md §7). */
export interface FoldedAnnotations {
  /** Every non-capture arm — file / line / change / walkthrough-section / text-span — as a note. */
  notes: AnnotationNote[];
  /** The `text-span` quotes to highlight in the section prose, as a text-span Finding is. */
  quotes: string[];
}

// The two arms that pin to a capture; every other arm falls through to a note.
const CAPTURE_ANCHOR_KINDS: ReadonlySet<Anchor["kind"]> = new Set([
  ANCHOR_KIND.screenshotRegion,
  ANCHOR_KIND.recordingTimestamp,
]);

/**
 * Fold a product section's annotations into the surfaces that render them so
 * that **every arm the annotation schema admits shows somewhere** — nothing an
 * author writes is silently dropped (walkthroughs.md §7). An annotation carries
 * the full Finding anchor vocabulary, but only the two capture arms pin to a
 * capture (handled per-capture by `annotationsFor`); the rest have no capture to
 * overlay. Each such arm becomes a section-level note located by
 * `findingLocation` — the file for a `file` anchor, `file:line` for a `line`
 * one, and so on — and a `text-span` additionally contributes its quote for
 * in-prose highlighting, mirroring a text-span Finding.
 */
export function foldSectionAnnotations(
  annotations: readonly WalkthroughAnnotation[]
): FoldedAnnotations {
  const notes: AnnotationNote[] = [];
  const quotes: string[] = [];

  for (const annotation of annotations) {
    if (CAPTURE_ANCHOR_KINDS.has(annotation.anchor.kind)) {
      continue;
    }

    notes.push({
      body: annotation.body,
      location: findingLocation(annotation.anchor),
    });
    if (annotation.anchor.kind === "text-span") {
      quotes.push(annotation.anchor.quote);
    }
  }

  return { notes, quotes };
}
