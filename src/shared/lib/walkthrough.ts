/**
 * The pure reads the Code and Product walkthrough tabs fold over their manifests
 * and sections (walkthroughs.md §4, §5, §8). Runtime-neutral: no Bun or DOM
 * globals, so the server and the client share one definition, and every fold
 * below is a plain unit-tested function. The walkthrough schemas themselves live
 * in `schemas/walkthrough.ts`.
 *
 * The manifest is `kind`-discriminated and a section swaps its targets by kind
 * (walkthroughs.md §2). The **code** arm folds a range — `{ file, side, blobSha,
 * lines }`, the same coordinate as the `line` anchor arm, so drift is the Finding
 * re-anchor reused verbatim (§5, §8; no second algorithm). The **product** arm
 * folds captures/annotations: the `{{capture:i}}` interleave, `captureById`, and
 * identity-based drift (`identityDrift` — live/outdated, no shifted, §8), each a
 * plain unit-tested function the Product tab renders over.
 */

import type { DriftState } from "../schemas/drift";
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
  targetKind: "range" | "capture"
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
    segments.push(
      targetKind === "range"
        ? { index, kind: "range" }
        : { index, kind: "capture" }
    );
  }

  marker.lastIndex = 0;
  for (
    let match = marker.exec(body);
    match !== null;
    match = marker.exec(body)
  ) {
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
export function interleaveSegments(
  body: string,
  rangeCount: number
): Segment[] {
  return interleave(body, rangeCount, RANGE_MARKER, "range");
}

/** Fold a product section body over its `{{capture:i}}` markers (walkthroughs.md §5). */
export function interleaveCaptureSegments(
  body: string,
  captureCount: number
): Segment[] {
  return interleave(body, captureCount, CAPTURE_MARKER, "capture");
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

/**
 * The walkthrough a pillar tab shows: the newest entry of `kind` by id. Ids are
 * ULID-shaped, so the lexically-greatest id is the most recently minted — the
 * "one walkthrough per Change per pillar" a tab renders (walkthroughs.md §2).
 */
function latestWalkthrough<T extends { id: string; kind: "code" | "product" }>(
  entries: readonly T[],
  kind: "code" | "product"
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
export function latestCodeWalkthrough<
  T extends { id: string; kind: "code" | "product" },
>(entries: readonly T[]): T | undefined {
  return latestWalkthrough(entries, "code");
}

/** The newest **product** walkthrough — the one the Product walkthrough tab renders. */
export function latestProductWalkthrough<
  T extends { id: string; kind: "code" | "product" },
>(entries: readonly T[]): T | undefined {
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

/**
 * The minimal walkthrough shape identity drift reads — a pillar-tagged list of
 * sections, each with the prose and capture placements presence is judged
 * against. Structural, so a `WalkthroughEntry` (which carries more) satisfies
 * it and the tests can hand-build lightweight fixtures.
 */
interface WalkthroughLike {
  id: string;
  kind: "code" | "product";
  sections: readonly {
    body: string;
    captures?: readonly string[];
    id: string;
  }[];
}

/** The capture ids the sections of a walkthrough place, in any section (walkthroughs.md §6). */
function placedCaptureIds(entry: WalkthroughLike | undefined): Set<string> {
  return new Set(
    (entry?.sections ?? []).flatMap((section) => section.captures ?? [])
  );
}

/** A settled identity-arm drift plus the born target an outdated one detaches to. */
export interface IdentityAnchorDrift {
  /** The born section prose (walkthrough-section) or born quote (text-span); absent for capture arms. */
  bornText?: string;
  state: DriftState;
}

/**
 * The identity-addressed drift of an anchor against the current walkthroughs
 * (data-model.md §6.2) — the analog of `planDrift` for the four identity arms,
 * which carry no content-addressed re-anchor and never `shift`. `undefined` for
 * a content anchor (change/file/line), so a caller falls through to `planDrift`.
 *
 * An arm is `live` while its target survives in the **latest** walkthrough of
 * its pillar, `outdated` once the walkthrough is superseded or the target is
 * gone — then it detaches and renders against its born target:
 *
 * - **walkthrough-section** — live only while its `walkthroughId` is still the
 *   latest of its kind and holds the section; detaches to the born section prose,
 *   recovered from the superseded walkthrough still walked off disk.
 * - **screenshot-region / recording-timestamp** — live while its capture is
 *   still placed in a section of the latest product walkthrough; its born image
 *   is recovered in the Product tab, so no `bornText` here.
 * - **text-span** — live while its section survives in the latest product
 *   walkthrough; detaches to its born quote (carried on the anchor itself).
 */
export function identityAnchorDrift(
  anchor: Anchor,
  walkthroughs: readonly WalkthroughLike[]
): IdentityAnchorDrift | undefined {
  if (anchor.kind === "walkthrough-section") {
    const born = walkthroughs.find(
      (entry) => entry.id === anchor.walkthroughId
    );
    const latest = born
      ? latestWalkthrough(walkthroughs, born.kind)
      : undefined;
    const section = born?.sections.find(
      (candidate) => candidate.id === anchor.sectionId
    );
    const present =
      latest?.id === anchor.walkthroughId && section !== undefined;

    return {
      state: identityDrift(present),
      ...(section === undefined ? {} : { bornText: section.body }),
    };
  }

  if (
    anchor.kind === "screenshot-region" ||
    anchor.kind === "recording-timestamp"
  ) {
    const latest = latestProductWalkthrough(walkthroughs);

    return {
      state: identityDrift(placedCaptureIds(latest).has(anchor.capture)),
    };
  }

  if (anchor.kind === "text-span") {
    const latest = latestProductWalkthrough(walkthroughs);
    const present =
      latest?.sections.some((section) => section.id === anchor.section) ??
      false;

    return { bornText: anchor.quote, state: identityDrift(present) };
  }

  return undefined;
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
  "screenshot-region",
  "recording-timestamp",
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
