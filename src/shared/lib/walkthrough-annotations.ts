import { ANCHOR_KIND } from "../enums/anchor-kind";
import type { DriftState } from "../enums/drift-state";
import type { Anchor } from "../schemas/comment";
import type {
  Capture,
  WalkthroughAnnotation,
  WalkthroughRange,
} from "../schemas/walkthrough";
import { commentLocation } from "./comment";

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

const DRIFT_RANK: Record<DriftState, number> = {
  live: 0,
  outdated: 2,
  shifted: 1,
};

/** A not-yet-computed range (undefined) reads as live, so the rollup only escalates as re-anchors resolve — never flashing a worse state than the evidence supports. */
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

export interface Staleness {
  behind: number;
  stale: boolean;
}

/** An unknown born Change reads as maximally stale — born before every Change we hold. `changes` is in mint order, newest last. */
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

export function captureById(
  manifest: { captures?: readonly Capture[] } | undefined,
  captureId: string
): Capture | undefined {
  return manifest?.captures?.find((capture) => capture.id === captureId);
}

export interface AnnotationNote {
  body: string;
  location: string;
}

export interface FoldedAnnotations {
  notes: AnnotationNote[];
  quotes: string[];
}

const CAPTURE_ANCHOR_KINDS: ReadonlySet<Anchor["kind"]> = new Set([
  ANCHOR_KIND.screenshotRegion,
  ANCHOR_KIND.recordingTimestamp,
]);

/** Every arm the annotation schema admits shows somewhere — nothing an author writes is silently dropped. */
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
      location: commentLocation(annotation.anchor),
    });
    if (annotation.anchor.kind === "text-span") {
      quotes.push(annotation.anchor.quote);
    }
  }

  return { notes, quotes };
}
