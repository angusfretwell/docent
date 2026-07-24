import type { Callout } from "@client/features/walkthrough/callouts";
import { ANCHOR_KIND } from "@shared/enums/anchor-kind";
import type { DriftState } from "@shared/enums/drift-state";
import type { FoldedFinding } from "@shared/lib/finding";
import { identityDrift } from "@shared/lib/identity-drift";
import type { Anchor } from "@shared/schemas/finding";
import type {
  Capture,
  WalkthroughAnnotation,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";

export const TEXT_SPAN = "text-span";

export interface RegionPin {
  body: string;
  label: string;
  rect: readonly [number, number, number, number];
}

export interface TimePin {
  atMs: number;
  body: string;
  label: string;
  toMs?: number;
}

// Derived from the Finding anchor union so it can't drift from the schema.
type CaptureAnchor = Extract<
  Anchor,
  { kind: "screenshot-region" | "recording-timestamp" }
>;

interface RawPin {
  anchor: CaptureAnchor;
  body: string;
  label: string;
}

export function captureAnchorId(
  anchor?: FoldedFinding["anchor"]
): string | undefined {
  if (
    anchor?.kind === ANCHOR_KIND.screenshotRegion ||
    anchor?.kind === ANCHOR_KIND.recordingTimestamp
  ) {
    return anchor.capture;
  }
  return undefined;
}

/**
 * Placement, not registry membership, is the test: a capture no section renders
 * has nowhere to pin a live Finding, so such Findings detach and surface rather
 * than vanish. `undefined` for a non-capture anchor.
 */
export function captureFindingDrift(
  anchor: FoldedFinding["anchor"],
  placedCaptureIds: ReadonlySet<string>
): DriftState | undefined {
  const id = captureAnchorId(anchor);
  return id === undefined ? undefined : identityDrift(placedCaptureIds.has(id));
}

/** Annotations targeting the capture (numbered `A1…`) then its Findings (`F1…`). */
function rawPins(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  captureId: string,
  kind: "screenshot-region" | "recording-timestamp"
): RawPin[] {
  const pins: RawPin[] = [];
  let annotationCount = 0;
  for (const annotation of annotations) {
    if (annotation.anchor.kind === kind) {
      annotationCount += 1;
      pins.push({
        anchor: annotation.anchor,
        body: annotation.body,
        label: `A${annotationCount}`,
      });
    }
  }
  let findingCount = 0;
  for (const finding of findings) {
    const { anchor } = finding;
    if (anchor?.kind === kind && anchor.capture === captureId) {
      findingCount += 1;
      pins.push({
        anchor,
        body: finding.body,
        label: `F${findingCount}`,
      });
    }
  }
  return pins;
}

function captureArm(capture: Capture) {
  return capture.kind === "recording"
    ? ANCHOR_KIND.recordingTimestamp
    : ANCHOR_KIND.screenshotRegion;
}

export function screenshotPins(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  capture: Capture
): RegionPin[] {
  const regions: RegionPin[] = [];

  for (const pin of rawPins(
    annotations,
    findings,
    capture.id,
    ANCHOR_KIND.screenshotRegion
  )) {
    const rect =
      pin.anchor.kind === ANCHOR_KIND.screenshotRegion
        ? pin.anchor.rect
        : undefined;

    if (rect) {
      regions.push({ body: pin.body, label: pin.label, rect });
    }
  }

  return regions;
}

export function recordingPins(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  capture: Capture
): TimePin[] {
  const times: TimePin[] = [];

  for (const pin of rawPins(
    annotations,
    findings,
    capture.id,
    ANCHOR_KIND.recordingTimestamp
  )) {
    if (pin.anchor.kind !== ANCHOR_KIND.recordingTimestamp) {
      continue;
    }

    const { fromMs, toMs } = pin.anchor;

    if (fromMs !== undefined) {
      times.push({ atMs: fromMs, body: pin.body, label: pin.label, toMs });
    }
  }

  return times;
}

/**
 * Every callout the capture carries, in the same order and labels as its
 * overlays — including the pins no coordinate placed, which have no overlay.
 */
export function captureCallouts(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  capture: Capture
): Callout[] {
  return rawPins(annotations, findings, capture.id, captureArm(capture)).map(
    ({ body, label }) => ({ body, label })
  );
}

/**
 * A non-capture arm never matches a capture id here; `foldSectionAnnotations`
 * surfaces those as section notes so none is dropped.
 */
export function annotationsFor(
  section: WalkthroughSection,
  captureId: string
): WalkthroughAnnotation[] {
  return (section.annotations ?? []).filter(
    (annotation) => captureAnchorId(annotation.anchor) === captureId
  );
}
