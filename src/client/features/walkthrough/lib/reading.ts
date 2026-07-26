/**
 * Where the reader's eye is taken to be, as a fraction of the prose viewport. An
 * anchor is read from above: the prose that explains it follows it, so the line
 * sits high enough to leave that prose on screen.
 */
const READ_LINE_FRACTION = 1 / 3;

/** Clearance at either end of the viewport, so prose brought into view doesn't sit flush against an edge. */
const HEADROOM_PX = 24;

export interface AnchorPlacement {
  key: string;
  /** Offset from the top of the prose viewport, negative once scrolled past. */
  top: number;
}

/** A run of prose in the viewport's own coordinates: an anchor's paragraph, its section, or the anchor itself. */
export interface ProseExtent {
  bottom: number;
  top: number;
}

function readLineOf(height: number): number {
  return height * READ_LINE_FRACTION;
}

/**
 * The anchor the reader has most recently read past: the last one above the read
 * line, or the first anchor while the reader is still above them all.
 *
 * Answered from where the prose stands rather than from anchors crossing an edge,
 * so no anchor can be skipped by arriving in a frame that went unmeasured, and a
 * fast scroll lands on one reading instead of replaying every anchor it passed.
 * Anchors that share a line — a row of chips — answer with the first of them,
 * which is the one the reader meets first and can step on from.
 */
export function targetUnderRead(
  anchors: readonly AnchorPlacement[],
  height: number
): string | undefined {
  const readLine = readLineOf(height);

  let reached: AnchorPlacement | undefined;

  for (const anchor of anchors) {
    if (
      anchor.top <= readLine &&
      (reached === undefined || anchor.top > reached.top)
    ) {
      reached = anchor;
    }
  }

  return (reached ?? anchors[0])?.key;
}

/**
 * The most prose around an anchor that the viewport can hold whole — its section
 * when the section fits, its paragraph when it doesn't — given the anchor's
 * enclosing runs from innermost outwards. Landing on a bare anchor drops the
 * reader mid-thought: the sentence that introduces it is the point of arriving.
 */
export function extentToRead(
  extents: readonly ProseExtent[],
  height: number
): ProseExtent | undefined {
  const room = height - HEADROOM_PX * 2;

  return (
    extents.findLast((extent) => extent.bottom - extent.top <= room) ??
    extents[0]
  );
}

/**
 * How far the prose has to move for a run of it to be worth reading from, as a
 * delta on the scroll position. It travels no further than it must: none at all
 * while the run is already on screen below the headroom, up until the run's start
 * meets the read line or its end clears the foot, down until the start meets the
 * headroom. A run too tall to hold whole gives up its end rather than its start,
 * which is where reading it begins.
 */
export function nudgeIntoRead(extent: ProseExtent, height: number): number {
  const wanted = Math.max(
    extent.top - readLineOf(height),
    extent.bottom - (height - HEADROOM_PX)
  );

  return Math.min(Math.max(0, wanted), extent.top - HEADROOM_PX);
}
