import type {
  AnnotationSide,
  DiffLineAnnotation,
  FileDiffMetadata,
} from "@pierre/diffs";
import type { DriftState } from "@shared/enums/drift-state";
import type { Side } from "@shared/enums/side";
import type { FoldedComment } from "@shared/lib/comment";
import type { Anchor } from "@shared/schemas/comment";

import type { DriftResult } from "./drift";

export type Annotation =
  | { drift?: DriftState; comment: FoldedComment; kind: "comment" }
  | { kind: "composer" };

export interface Composing {
  anchor: Anchor;
  annotationSide: AnnotationSide;
  itemId: string;
  lineNumber: number;
}

// data-model.md §5.3: base lines map to the deletions side, head lines to additions.
export function annotationSide(side: Side): AnnotationSide {
  return side === "head" ? "additions" : "deletions";
}

// The inline line an anchor renders at, or `undefined` to drop it to the panel.
// Without a drift read (Pending), the sync fast path pins a line anchor only while its
// born blobSha still matches the diff's blob on its side, else drops it rather than
// pin to possibly-wrong code (data-model.md §6, §6.1).
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

// Change- and non-code anchors are panel-only, so they are skipped here.
function commentAnnotations(
  comments: readonly FoldedComment[],
  fileDiff: FileDiffMetadata,
  driftFor: ((id: string) => DriftResult | undefined) | undefined
): DiffLineAnnotation<Annotation>[] {
  return comments.flatMap((comment): DiffLineAnnotation<Annotation>[] => {
    const { anchor } = comment;
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
      driftFor?.(comment.id),
      driftFor !== undefined
    );
    if (placement === undefined) {
      return [];
    }

    return [
      {
        lineNumber: placement.lineNumber,
        metadata: { comment, drift: placement.drift, kind: "comment" },
        side: annotationSide(anchor.side),
      },
    ];
  });
}

export function itemAnnotations(params: {
  composing: Composing | null;
  driftFor?: (id: string) => DriftResult | undefined;
  fileDiff: FileDiffMetadata;
  comments: readonly FoldedComment[];
  itemId: string;
}): DiffLineAnnotation<Annotation>[] {
  const annotations = commentAnnotations(
    params.comments,
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

// Folded into the item's CodeView `version` so it re-renders exactly when its annotations change.
export function annotationsKey(
  annotations: readonly DiffLineAnnotation<Annotation>[]
): string {
  return annotations
    .map((annotation) =>
      annotation.metadata.kind === "comment"
        ? [
            annotation.side,
            annotation.lineNumber,
            annotation.metadata.comment.id,
            annotation.metadata.comment.status,
            annotation.metadata.comment.replies.length,
            annotation.metadata.drift ?? "",
          ].join(":")
        : `composer:${annotation.side}:${annotation.lineNumber}`
    )
    .join("|");
}
