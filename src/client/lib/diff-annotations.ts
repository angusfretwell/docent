/**
 * The pure model behind the diff's inline Findings: what a diff-line annotation
 * carries, how a Finding's `line`/`file` anchor maps onto a
 * `{ side, lineNumber }` placement, and the stable key that folds a file's
 * annotations into its CodeView item `version`. No React or DOM here —
 * `diff/annotation.tsx` renders what this computes.
 */

import type {
  AnnotationSide,
  DiffLineAnnotation,
  FileDiffMetadata,
} from "@pierre/diffs";
import type { DriftState } from "@shared/enums/drift-state";
import type { Side } from "@shared/enums/side";
import type { FoldedFinding } from "@shared/lib/finding";
import type { Anchor } from "@shared/schemas/finding";

import type { DriftResult } from "./drift";

// A diff line-annotation carries either an existing Finding to render as a
// thread, or the marker for the in-progress composer authoring a new one. Both
// surface through `renderAnnotation`, anchored at `{ side, lineNumber }`. A
// finding annotation carries its drift so the inline thread can badge a shifted
// re-anchor (data-model.md §6.1).
export type Annotation =
  | { drift?: DriftState; finding: FoldedFinding; kind: "finding" }
  | { kind: "composer" };

// An in-progress authored Finding: the fully-formed anchor it will carry, plus
// where its composer renders inline (which item, which side, which line).
export interface Composing {
  anchor: Anchor;
  annotationSide: AnnotationSide;
  itemId: string;
  lineNumber: number;
}

// The diff-side an anchor's own side maps onto (data-model.md §5.3: base lines
// live on the deletions side, head lines on the additions side).
export function annotationSide(side: Side): AnnotationSide {
  return side === "head" ? "additions" : "deletions";
}

// The inline line an anchor renders at, or `undefined` to drop it to the panel.
// With a drift read (§6.1): a **live** line anchor pins to its born line, a
// **shifted** one re-anchors to its moved line, an **outdated** one detaches
// (panel only), and a still-computing re-anchor is held back rather than
// mis-pinned; a file anchor stays inline (line 0) unless outdated.
//
// Without a drift read (Pending), it falls back to the sync fast path: a line
// anchor renders only while its born `blobSha` still equals the diff's blob on
// its own side (head → `newObjectId`, base → `prevObjectId`), and drops
// otherwise — never pinning to possibly-wrong code (§6).
function inlineLine(
  anchor: Extract<Anchor, { kind: "file" | "line" }>,
  fileDiff: FileDiffMetadata,
  drift: DriftResult | undefined,
  hasDrift: boolean
): { drift?: DriftState; lineNumber: number } | undefined {
  if (hasDrift) {
    if (drift === undefined || drift.state === "outdated") {
      return undefined;
    }
    const lineNumber =
      anchor.kind === "line" ? (drift.lines?.[0] ?? anchor.lines[0]) : 0;
    return { drift: drift.state, lineNumber };
  }
  if (anchor.kind === "line") {
    const sideBlob =
      anchor.side === "head" ? fileDiff.newObjectId : fileDiff.prevObjectId;
    if (anchor.blobSha !== sideBlob) {
      return undefined;
    }
    return { lineNumber: anchor.lines[0] };
  }
  return { lineNumber: 0 };
}

// Existing Findings anchored into a file, as diff-line annotations. Change- and
// non-code anchors show only in the panel, so they are skipped; the rest defer
// their inline placement (and whether they appear at all) to `inlineLine`.
function findingAnnotations(
  findings: readonly FoldedFinding[],
  fileDiff: FileDiffMetadata,
  driftFor: ((id: string) => DriftResult | undefined) | undefined
): DiffLineAnnotation<Annotation>[] {
  return findings.flatMap((finding): DiffLineAnnotation<Annotation>[] => {
    const { anchor } = finding;
    if (
      anchor === undefined ||
      (anchor.kind !== "line" && anchor.kind !== "file")
    ) {
      return [];
    }
    if (anchor.file !== fileDiff.name && anchor.file !== fileDiff.prevName) {
      return [];
    }

    const placement = inlineLine(
      anchor,
      fileDiff,
      driftFor?.(finding.id),
      driftFor !== undefined
    );
    if (placement === undefined) {
      return [];
    }

    return [
      {
        lineNumber: placement.lineNumber,
        metadata: { drift: placement.drift, finding, kind: "finding" },
        side: annotationSide(anchor.side),
      },
    ];
  });
}

/**
 * Every annotation for a file's diff item: its anchored Findings, plus the
 * composer marker when a new Finding is being authored on this item.
 */
export function itemAnnotations(params: {
  composing: Composing | null;
  driftFor?: (id: string) => DriftResult | undefined;
  fileDiff: FileDiffMetadata;
  findings: readonly FoldedFinding[];
  itemId: string;
}): DiffLineAnnotation<Annotation>[] {
  const annotations = findingAnnotations(
    params.findings,
    params.fileDiff,
    params.driftFor
  );

  if (params.composing !== null && params.composing.itemId === params.itemId) {
    annotations.push({
      lineNumber: params.composing.lineNumber,
      metadata: { kind: "composer" },
      side: params.composing.annotationSide,
    });
  }

  return annotations;
}

/**
 * A stable digest of an item's annotations, folded into its CodeView `version`
 * so the item re-renders exactly when a thread appears, moves, grows, resolves,
 * drifts, or the composer opens/closes on it.
 */
export function annotationsKey(
  annotations: readonly DiffLineAnnotation<Annotation>[]
): string {
  return annotations
    .map((annotation) =>
      annotation.metadata.kind === "finding"
        ? [
            annotation.side,
            annotation.lineNumber,
            annotation.metadata.finding.id,
            annotation.metadata.finding.status,
            annotation.metadata.finding.replies.length,
            annotation.metadata.drift ?? "",
          ].join(":")
        : `composer:${annotation.side}:${annotation.lineNumber}`
    )
    .join("|");
}
