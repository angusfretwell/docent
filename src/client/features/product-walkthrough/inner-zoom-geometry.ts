/**
 * The pure geometry behind `useInnerZoom`: given the capture's natural size, the
 * stage it sits in, and the view the reader has pushed it to, `measure` resolves
 * where the frame lands and the limits the gestures may move it between. No React
 * and no DOM state, so the hook's render and its gesture handlers can derive the
 * same geometry the same way — and this seam is unit-tested on its own.
 */

/** How far off-centre, in stage pixels, the capture has been pushed on each axis. */
export interface Offset {
  x: number;
  y: number;
}

/** The measured stage the capture is fitted into. */
export interface Size {
  height: number;
  width: number;
}

/** What the reader has done to the capture: how far in, and pushed how far off-centre. */
export interface View {
  offset: Offset;
  scale: number;
}

/** Where the frame lands, and the limits the gestures are allowed to move it between. */
export interface Geometry {
  fitScale: number;
  height: number;
  maxScale: number;
  placed: Offset;
  scale: number;
  slackX: number;
  slackY: number;
  stepScale: number;
  width: number;
}

/**
 * How large a double-click step zooms relative to the size the capture was taken
 * at. 1 renders a screenshot pixel-for-pixel as the app was drawn, which is the
 * point of zooming one — text lands at the size it was really read at.
 */
const STEP_SCALE = 1;

/** How far past the captured size the wheel and pinch can push. */
const MAX_SCALE = 4;

/** A line-mode wheel notch in pixels, for the browsers that report lines. */
const LINE_HEIGHT = 16;

/** Clamp one axis into `[slack, 0]` when the frame overflows, or centre it when it doesn't. */
export function clampAxis(value: number, slack: number) {
  if (slack >= 0) {
    return slack / 2;
  }

  return Math.min(Math.max(value, slack), 0);
}

/** Wheel deltas arrive in pixels, lines, or pages depending on the device. */
export function wheelPixels(event: WheelEvent) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * LINE_HEIGHT;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * LINE_HEIGHT * 10;
  }

  return event.deltaY;
}

/**
 * Resolve a view against the stage it sits in. The stored scale and offset are
 * both requests rather than facts: the scale is clamped between fitting and the
 * ceiling, and the offset is clamped on the way out, so a resize that changes
 * what "in bounds" means re-resolves rather than stranding the frame.
 */
export function measure(
  natural: readonly [number, number],
  stage: Size,
  view: View
): Geometry {
  const [naturalWidth, naturalHeight] = natural;

  const fitScale = Math.min(
    stage.width / naturalWidth,
    stage.height / naturalHeight,
    1
  );

  // Floored at cover so a step always fills the stage, however wide the panel is
  // dragged — a capture smaller than the stage would otherwise "zoom" to
  // something with letterboxing still around it.
  const coverScale = Math.max(
    stage.width / naturalWidth,
    stage.height / naturalHeight
  );
  const stepScale = Math.max(STEP_SCALE, coverScale);
  const maxScale = Math.max(MAX_SCALE, stepScale);

  const scale = Math.min(Math.max(view.scale, fitScale), maxScale);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const slackX = stage.width - width;
  const slackY = stage.height - height;

  return {
    fitScale,
    height,
    maxScale,
    placed: {
      x: clampAxis(view.offset.x, slackX),
      y: clampAxis(view.offset.y, slackY),
    },
    scale,
    slackX,
    slackY,
    stepScale,
    width,
  };
}
