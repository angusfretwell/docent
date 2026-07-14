/**
 * Pure pin derivation for the Product walkthrough tab (walkthroughs.md §7):
 * turns a capture's annotations and Findings into positioned overlays — region
 * rects on a screenshot, timeline markers on a recording — and into the callouts
 * that carry their bodies. The two capture anchor arms (`screenshot-region`,
 * `recording-timestamp`) drive both an authored annotation's durable pin and a
 * reviewer Finding's; the label prefix tells the two acts apart, each numbered
 * `A1…`/`F1…` within its capture.
 *
 * Placement and body are split deliberately: the overlays live on the capture in
 * the target panel, while the bodies read inline in the prose beside it, so a
 * reader follows the narration without their eye leaving the column. A pin whose
 * anchor carries no coordinate has nothing to position and so contributes a
 * callout only. No DOM or React here — the walkthrough components render what
 * this computes.
 */

import type { FoldedFinding } from "@shared/lib/finding";
import { identityDrift } from "@shared/lib/identity-drift";
import type { DriftState } from "@shared/schemas/drift";
import type { Anchor } from "@shared/schemas/finding";
import type {
  Capture,
  WalkthroughAnnotation,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";

// The capture anchor arms, named once so narrowing and filters read one token.
export const SCREENSHOT_REGION = "screenshot-region";
export const RECORDING_TIMESTAMP = "recording-timestamp";
export const TEXT_SPAN = "text-span";

/** A screenshot-region rect an overlay can position, plus its callout body. */
export interface RegionPin {
  body: string;
  label: string;
  rect: readonly [number, number, number, number];
}

/** A recording-timestamp marker on the replay timeline, plus its callout. */
export interface TimePin {
  atMs: number;
  body: string;
  label: string;
  toMs?: number;
}

/** One pin's label and body, as the prose lists it beside the capture. */
export interface Callout {
  body: string;
  label: string;
}

// The two capture anchor arms are structurally identical across annotations and
// Findings — same `kind`/`capture` plus an optional coordinate — so one raw
// collector feeds both the screenshot and recording placement (§7). The shape is
// the Finding union's two capture arms (an annotation anchor is assignable to it),
// derived so it can't drift from the schema. A pin sourced from an annotation is
// labelled `A`; from a Finding, `F`.
type CaptureAnchor = Extract<
  Anchor,
  { kind: "screenshot-region" | "recording-timestamp" }
>;

interface RawPin {
  anchor: CaptureAnchor;
  body: string;
  label: string;
}

/** The capture id an anchor targets, or `undefined` for a non-capture anchor. */
export function captureAnchorId(
  anchor?: FoldedFinding["anchor"]
): string | undefined {
  if (
    anchor?.kind === SCREENSHOT_REGION ||
    anchor?.kind === RECORDING_TIMESTAMP
  ) {
    return anchor.capture;
  }
  return undefined;
}

/**
 * The identity drift of a capture-arm Finding (walkthroughs.md §8): `live` while
 * the capture it points at is still placed in a section here, `outdated` once
 * gone — the single live/outdated decision both the inline pins and the detached
 * section route off. `undefined` for a non-capture anchor. Placement, not mere
 * registry membership, is the test: a capture no section renders has nowhere to
 * pin a live Finding, so such Findings detach and surface rather than vanish.
 */
export function captureFindingDrift(
  anchor: FoldedFinding["anchor"],
  placedCaptureIds: ReadonlySet<string>
): DriftState | undefined {
  const id = captureAnchorId(anchor);
  return id === undefined ? undefined : identityDrift(placedCaptureIds.has(id));
}

/**
 * The raw pins for one capture of one arm `kind`: annotations targeting it
 * (numbered `A1…`) then Findings anchored to it (numbered `F1…`). Whether each
 * pin is placed (has a coordinate) or whole-capture is decided by the caller,
 * which reads the coordinate off the anchor.
 */
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

/** The arm a capture's pins are anchored through, by the kind of capture it is. */
function captureArm(capture: Capture) {
  return capture.kind === "recording" ? RECORDING_TIMESTAMP : SCREENSHOT_REGION;
}

/** A capture's screenshot pins that carry a rect, as overlay rectangles. */
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
    SCREENSHOT_REGION
  )) {
    const rect =
      pin.anchor.kind === SCREENSHOT_REGION ? pin.anchor.rect : undefined;

    if (rect) {
      regions.push({ body: pin.body, label: pin.label, rect });
    }
  }

  return regions;
}

/** A capture's recording pins that carry an offset, as timeline markers. */
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
    RECORDING_TIMESTAMP
  )) {
    if (pin.anchor.kind !== RECORDING_TIMESTAMP) {
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
 * Every callout a capture carries, in the same order and under the same labels
 * as its overlays — including the pins no coordinate placed, which have no
 * overlay to be read from. This is the whole of the capture's prose: the labels
 * are the only thread back to the marks on the capture itself.
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
 * The annotations in a section that target a given capture id — the capture-arm
 * annotations that pin onto this capture. An annotation's anchor spans the full
 * Finding vocabulary (§7), so a non-capture arm never matches a capture id here;
 * `foldSectionAnnotations` surfaces those as section notes so none is dropped.
 */
export function annotationsFor(
  section: WalkthroughSection,
  captureId: string
): WalkthroughAnnotation[] {
  return (section.annotations ?? []).filter(
    (annotation) => captureAnchorId(annotation.anchor) === captureId
  );
}
