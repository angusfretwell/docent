/**
 * Where the reader's eye is taken to be, as a fraction of the prose viewport. An
 * anchor is read from above: the prose that explains it follows it, so the line
 * sits high enough to leave that prose on screen.
 */
const READ_LINE_FRACTION = 1 / 3;

/** Clearance for an anchor pulled back down into view, so it doesn't sit flush against the top edge. */
const HEADROOM_PX = 24;

export interface AnchorPlacement {
  key: string;
  /** Offset from the top of the prose viewport, negative once scrolled past. */
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
 * How far the prose has to move for an anchor to be worth reading from, as a
 * delta on the scroll position: to the read line when it sits below, to the
 * headroom when it sits above, and nowhere at all in between — anything already
 * in that band is on screen with its prose, so moving it only costs the reader
 * their place.
 */
export function nudgeIntoRead(top: number, height: number): number {
  const readLine = readLineOf(height);

  if (top > readLine) {
    return top - readLine;
  }

  if (top < HEADROOM_PX) {
    return top - HEADROOM_PX;
  }

  return 0;
}
