/**
 * The pure model behind the diff's inline Findings: what a diff-line annotation
 * carries, how a Finding's anchor maps onto a `{ side, lineNumber }`, and the
 * `CodeViewItem` list (annotations + viewed/expanded version) the renderer
 * consumes. No React or DOM here — `diff-view.tsx` renders what this computes.
 */

import type {
  AnnotationSide,
  CodeViewItem,
  DiffLineAnnotation,
  FileDiffMetadata,
} from "@pierre/diffs";
import type { DriftState } from "@shared/schemas/drift.ts";
import type { FoldedFinding } from "@shared/lib/finding.ts";
import type { Anchor } from "@shared/schemas/finding.ts";
import type { DriftResult } from "./drift.ts";
import type { FileEntry } from "./nav.ts";

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
  itemId: string;
  anchor: Anchor;
  annotationSide: AnnotationSide;
  lineNumber: number;
}

// The diff-side an anchor's own side maps onto (data-model.md §5.3: base lines
// live on the deletions side, head lines on the additions side).
export function annotationSide(side: "base" | "head"): AnnotationSide {
  return side === "head" ? "additions" : "deletions";
}

// A cheap stable digest so a diff item's `version` changes exactly when its
// annotations do — CodeView only re-renders an item's annotations when its
// version moves. Modular arithmetic (no bitwise) keeps it in safe-integer range.
function hashString(input: string): number {
  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 2_147_483_647;
  }
  return hash;
}

// The inline line an anchor renders at, or `undefined` to drop it to the panel.
// With a drift read (§6.1): a **live** line anchor pins to its born line, a
// **shifted** one re-anchors to its moved line, an **outdated** one detaches
// (panel only), and a still-computing re-anchor is held back rather than
// mis-pinned; a file anchor stays inline (line 0) unless outdated.
//
// Without a drift read (Pending, tests), it falls back to the sync fast path:
// a line anchor renders only while its born `blobSha` still equals the diff's
// blob on its own side (head → `newObjectId`, base → `prevObjectId`), and drops
// otherwise — never pinning to possibly-wrong code (§6).
function inlineLine(
  anchor: Extract<Anchor, { kind: "file" | "line" }>,
  fileDiff: FileDiffMetadata,
  drift: DriftResult | undefined,
  hasDrift: boolean,
): { drift?: DriftState; lineNumber: number } | undefined {
  if (hasDrift) {
    if (drift === undefined || drift.state === "outdated") {
      return undefined;
    }
    const lineNumber = anchor.kind === "line" ? (drift.lines?.[0] ?? anchor.lines[0]) : 0;
    return { drift: drift.state, lineNumber };
  }
  if (anchor.kind === "line") {
    const sideBlob = anchor.side === "head" ? fileDiff.newObjectId : fileDiff.prevObjectId;
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
  entry: FileEntry,
  fileDiff: FileDiffMetadata,
  driftFor: ((id: string) => DriftResult | undefined) | undefined,
): DiffLineAnnotation<Annotation>[] {
  return findings.flatMap((finding): DiffLineAnnotation<Annotation>[] => {
    const { anchor } = finding;
    if (anchor === undefined || (anchor.kind !== "line" && anchor.kind !== "file")) {
      return [];
    }
    if (anchor.file !== entry.path && anchor.file !== entry.prevPath) {
      return [];
    }
    const placement = inlineLine(anchor, fileDiff, driftFor?.(finding.id), driftFor !== undefined);
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

// Every annotation for a file's diff item: its anchored Findings, plus the
// composer marker when a new Finding is being authored on this item.
function itemAnnotations(
  findings: readonly FoldedFinding[],
  entry: FileEntry,
  fileDiff: FileDiffMetadata,
  composing: Composing | null,
  driftFor: ((id: string) => DriftResult | undefined) | undefined,
): DiffLineAnnotation<Annotation>[] {
  const annotations = findingAnnotations(findings, entry, fileDiff, driftFor);
  if (composing !== null && composing.itemId === entry.id) {
    annotations.push({
      lineNumber: composing.lineNumber,
      metadata: { kind: "composer" },
      side: composing.annotationSide,
    });
  }
  return annotations;
}

// A stable key for an item's render-affecting state — its annotations plus the
// expanded/viewed axes — so CodeView's `version` moves on exactly those changes.
function itemKey(
  annotations: readonly DiffLineAnnotation<Annotation>[],
  expanded: boolean,
  collapsed: boolean,
): string {
  const annotationsKey = annotations
    .map((annotation) =>
      annotation.metadata.kind === "finding"
        ? `${annotation.side}:${annotation.lineNumber}:${annotation.metadata.finding.id}:${annotation.metadata.finding.resolved}:${annotation.metadata.finding.replies.length}:${annotation.metadata.finding.whatsNext}:${annotation.metadata.drift ?? ""}`
        : `composer:${annotation.side}:${annotation.lineNumber}`,
    )
    .join("|");
  return `${expanded ? "E" : ""}${collapsed ? "C" : ""}|${annotationsKey}`;
}

/**
 * Build the CodeView item list for the diff: each visible file's diff, its
 * inline Finding/composer annotations, and a `version` folding the annotation,
 * expansion, and viewed-collapse state so CodeView re-renders on any of them.
 */
export function buildDiffItems(params: {
  entries: readonly FileEntry[];
  findings: readonly FoldedFinding[];
  composing: Composing | null;
  fileDiffFor: (id: string) => FileDiffMetadata | undefined;
  isExpanded: (id: string) => boolean;
  isViewed: (id: string) => boolean;
  /** Collapse an edge-case body (binary/image/mode/submodule, unloaded large). */
  isEdgeCollapsed: (id: string) => boolean;
  /** Per-Finding drift; absent ⇒ the sync fast-path fallback (Pending, tests). */
  driftFor?: (id: string) => DriftResult | undefined;
}): CodeViewItem<Annotation>[] {
  return params.entries.flatMap((entry) => {
    const fileDiff = params.fileDiffFor(entry.id);
    if (fileDiff === undefined) {
      return [];
    }
    const collapsed = params.isViewed(entry.id) || params.isEdgeCollapsed(entry.id);
    const annotations = itemAnnotations(
      params.findings,
      entry,
      fileDiff,
      params.composing,
      params.driftFor,
    );
    const version = hashString(itemKey(annotations, params.isExpanded(entry.id), collapsed));
    return [{ annotations, collapsed, fileDiff, id: entry.id, type: "diff" as const, version }];
  });
}
