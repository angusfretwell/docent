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
import type { Anchor, FoldedFinding } from "../shared/finding.ts";
import type { FileEntry } from "./nav.ts";

// A diff line-annotation carries either an existing Finding to render as a
// thread, or the marker for the in-progress composer authoring a new one. Both
// surface through `renderAnnotation`, anchored at `{ side, lineNumber }`.
export type Annotation = { kind: "finding"; finding: FoldedFinding } | { kind: "composer" };

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

// Existing Findings anchored into a file, as diff-line annotations. Line anchors
// pin to their born line; file anchors render at line 0 (above the first line).
// Change- and non-code anchors show only in the panel, so they are skipped.
//
// Only a *live* line anchor renders inline: one whose born `blobSha` still
// equals the diff's blob on the anchor's own side (head → `newObjectId`, base →
// `prevObjectId`) is byte-identical, so its line numbers are trustworthy — the
// data-model.md §6.1 live fast path. Once that blob changes the anchor has
// drifted; rather than pin to possibly-wrong code (§6 "never pins to wrong
// code") it drops to the panel until re-anchoring (deferred) lands. File anchors
// carry no line numbers and §6.1 has them "drift only on delete/rename", so a
// present file's file-level Finding stays inline regardless of content edits.
function findingAnnotations(
  findings: readonly FoldedFinding[],
  entry: FileEntry,
  fileDiff: FileDiffMetadata,
): DiffLineAnnotation<Annotation>[] {
  return findings.flatMap((finding): DiffLineAnnotation<Annotation>[] => {
    const { anchor } = finding;
    if (anchor === undefined || (anchor.kind !== "line" && anchor.kind !== "file")) {
      return [];
    }
    if (anchor.file !== entry.path && anchor.file !== entry.prevPath) {
      return [];
    }
    if (anchor.kind === "line") {
      const sideBlob = anchor.side === "head" ? fileDiff.newObjectId : fileDiff.prevObjectId;
      if (anchor.blobSha !== sideBlob) {
        return [];
      }
    }
    return [
      {
        lineNumber: anchor.kind === "line" ? anchor.lines[0] : 0,
        metadata: { finding, kind: "finding" },
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
): DiffLineAnnotation<Annotation>[] {
  const annotations = findingAnnotations(findings, entry, fileDiff);
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
        ? `${annotation.side}:${annotation.lineNumber}:${annotation.metadata.finding.id}:${annotation.metadata.finding.resolved}:${annotation.metadata.finding.replies.length}:${annotation.metadata.finding.whatsNext}`
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
}): CodeViewItem<Annotation>[] {
  return params.entries.flatMap((entry) => {
    const fileDiff = params.fileDiffFor(entry.id);
    if (fileDiff === undefined) {
      return [];
    }
    const collapsed = params.isViewed(entry.id) || params.isEdgeCollapsed(entry.id);
    const annotations = itemAnnotations(params.findings, entry, fileDiff, params.composing);
    const version = hashString(itemKey(annotations, params.isExpanded(entry.id), collapsed));
    return [{ annotations, collapsed, fileDiff, id: entry.id, type: "diff" as const, version }];
  });
}
