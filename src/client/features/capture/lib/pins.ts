import type { LabeledCallout } from "@client/features/walkthrough/callouts";
import { ANCHOR_KIND } from "@shared/enums/anchor-kind";
import type { DriftState } from "@shared/enums/drift-state";
import type { FoldedComment } from "@shared/lib/comment";
import { identityDrift } from "@shared/lib/identity-drift";
import type { Anchor } from "@shared/schemas/comment";
import type {
  Capture,
  Callout,
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

// Derived from the Comment anchor union so it can't drift from the schema.
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
  anchor?: FoldedComment["anchor"]
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
 * has nowhere to pin a live Comment, so such Comments detach and surface rather
 * than vanish. `undefined` for a non-capture anchor.
 */
export function captureCommentDrift(
  anchor: FoldedComment["anchor"],
  placedCaptureIds: ReadonlySet<string>
): DriftState | undefined {
  const id = captureAnchorId(anchor);
  return id === undefined ? undefined : identityDrift(placedCaptureIds.has(id));
}

/** Callouts targeting the capture (numbered `<capture ordinal>.1…`) then its Comments (`C1…`). */
function rawPins(
  callouts: readonly Callout[],
  comments: readonly FoldedComment[],
  captureId: string,
  kind: "screenshot-region" | "recording-timestamp",
  ordinal: number
): RawPin[] {
  const pins: RawPin[] = [];
  let calloutCount = 0;
  for (const callout of callouts) {
    if (callout.anchor.kind === kind) {
      calloutCount += 1;
      pins.push({
        anchor: callout.anchor,
        body: callout.body,
        label: `${ordinal}.${calloutCount}`,
      });
    }
  }
  let commentCount = 0;
  for (const comment of comments) {
    const { anchor } = comment;
    if (anchor?.kind === kind && anchor.capture === captureId) {
      commentCount += 1;
      pins.push({
        anchor,
        body: comment.body,
        label: `C${commentCount}`,
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
  callouts: readonly Callout[],
  comments: readonly FoldedComment[],
  capture: Capture,
  ordinal: number
): RegionPin[] {
  const regions: RegionPin[] = [];

  for (const pin of rawPins(
    callouts,
    comments,
    capture.id,
    ANCHOR_KIND.screenshotRegion,
    ordinal
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
  callouts: readonly Callout[],
  comments: readonly FoldedComment[],
  capture: Capture,
  ordinal: number
): TimePin[] {
  const times: TimePin[] = [];

  for (const pin of rawPins(
    callouts,
    comments,
    capture.id,
    ANCHOR_KIND.recordingTimestamp,
    ordinal
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
  callouts: readonly Callout[],
  comments: readonly FoldedComment[],
  capture: Capture,
  ordinal: number
): LabeledCallout[] {
  return rawPins(
    callouts,
    comments,
    capture.id,
    captureArm(capture),
    ordinal
  ).map(({ body, label }) => ({ body, label }));
}

/**
 * A non-capture arm never matches a capture id here; `foldSectionCallouts`
 * surfaces those as section notes so none is dropped.
 */
export function calloutsFor(
  section: WalkthroughSection,
  captureId: string
): Callout[] {
  return (section.callouts ?? []).filter(
    (callout) => captureAnchorId(callout.anchor) === captureId
  );
}
