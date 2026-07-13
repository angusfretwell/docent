/**
 * Pure pin derivation for the Product walkthrough tab (walkthroughs.md §7):
 * turns a capture's annotations and Findings into positioned overlays — region
 * rects on a screenshot, timeline markers on a recording, or whole-capture
 * callouts when the anchor carries no coordinate. The two capture anchor arms
 * (`screenshot-region`, `recording-timestamp`) drive both an authored
 * annotation's durable pin and a reviewer Finding's; tone alone tells the two
 * acts apart (blue vs orange), each numbered `A1…`/`F1…` within its capture.
 * No DOM or React here — `product-walkthrough-view.tsx` renders what this
 * computes.
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

/** An overlay tone — the border and chip colour of a pin and its caption. */
export interface Tone {
  border: string;
  chip: string;
}

// Two visually distinct overlay tones: an authored annotation (durable, the
// --info blue) versus a reviewer Finding (the --signal orange), so a reader
// tells the two acts apart at a glance (walkthroughs.md §7). CSS variable
// references, resolved where the overlays render.
export const ANNOTATION_TONE: Tone = {
  border: "var(--color-info)",
  chip: "var(--color-info)",
};
export const FINDING_TONE: Tone = {
  border: "var(--color-signal)",
  chip: "var(--color-signal)",
};

// The capture anchor arms, named once so narrowing and filters read one token.
export const SCREENSHOT_REGION = "screenshot-region";
export const RECORDING_TIMESTAMP = "recording-timestamp";
export const TEXT_SPAN = "text-span";

/** A screenshot-region rect an overlay can position, plus its callout body and tone. */
export interface RegionPin {
  body: string;
  label: string;
  rect: readonly [number, number, number, number];
  tone: Tone;
}

/** A recording-timestamp marker on the replay timeline, plus its callout. */
export interface TimePin {
  atMs: number;
  body: string;
  label: string;
  toMs?: number;
  tone: Tone;
}

/** A capture-level callout with no coordinate — a whole-capture annotation or Finding. */
export interface WholePin {
  body: string;
  label: string;
  tone: Tone;
}

// The two capture anchor arms are structurally identical across annotations and
// Findings — same `kind`/`capture` plus an optional coordinate — so one raw
// collector feeds both the screenshot and recording placement (§7). The shape is
// the Finding union's two capture arms (an annotation anchor is assignable to it),
// derived so it can't drift from the schema. A pin sourced from an annotation is
// toned blue and labelled `A`; from a Finding, orange `F`.
type CaptureAnchor = Extract<
  Anchor,
  { kind: "screenshot-region" | "recording-timestamp" }
>;

interface RawPin {
  anchor: CaptureAnchor;
  body: string;
  label: string;
  tone: Tone;
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
        tone: ANNOTATION_TONE,
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
        tone: FINDING_TONE,
      });
    }
  }
  return pins;
}

/** Split a capture's screenshot pins into placed region rects and whole-capture callouts. */
export function screenshotPins(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  capture: Capture
): { regions: RegionPin[]; whole: WholePin[] } {
  const regions: RegionPin[] = [];
  const whole: WholePin[] = [];
  for (const pin of rawPins(
    annotations,
    findings,
    capture.id,
    SCREENSHOT_REGION
  )) {
    const rect =
      pin.anchor.kind === SCREENSHOT_REGION ? pin.anchor.rect : undefined;
    if (rect) {
      regions.push({ body: pin.body, label: pin.label, rect, tone: pin.tone });
    } else {
      whole.push({ body: pin.body, label: pin.label, tone: pin.tone });
    }
  }
  return { regions, whole };
}

/** Split a capture's recording pins into placed timeline markers and whole-capture callouts. */
export function recordingPins(
  annotations: readonly WalkthroughAnnotation[],
  findings: readonly FoldedFinding[],
  capture: Capture
): { times: TimePin[]; whole: WholePin[] } {
  const times: TimePin[] = [];
  const whole: WholePin[] = [];
  for (const pin of rawPins(
    annotations,
    findings,
    capture.id,
    RECORDING_TIMESTAMP
  )) {
    const from =
      pin.anchor.kind === RECORDING_TIMESTAMP ? pin.anchor.fromMs : undefined;
    const to =
      pin.anchor.kind === RECORDING_TIMESTAMP ? pin.anchor.toMs : undefined;
    if (from === undefined) {
      whole.push({ body: pin.body, label: pin.label, tone: pin.tone });
    } else {
      times.push({
        atMs: from,
        body: pin.body,
        label: pin.label,
        toMs: to,
        tone: pin.tone,
      });
    }
  }
  return { times, whole };
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
