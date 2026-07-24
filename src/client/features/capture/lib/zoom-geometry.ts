export interface Offset {
  x: number;
  y: number;
}

export interface Size {
  height: number;
  width: number;
}

export interface View {
  offset: Offset;
  scale: number;
}

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

/** 1 renders a screenshot pixel-for-pixel as the app drew it — text at the size it was really read at. */
const STEP_SCALE = 1;

const MAX_SCALE = 4;

const LINE_HEIGHT = 16;

/** Clamps into `[slack, 0]` when the frame overflows the axis, or centres it when it doesn't. */
export function clampAxis(value: number, slack: number) {
  if (slack >= 0) {
    return slack / 2;
  }

  return Math.min(Math.max(value, slack), 0);
}

/** Wheel deltas arrive in pixels, lines, or pages depending on the device. */
export function wheelDelta(event: WheelEvent): Offset {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return { x: event.deltaX * LINE_HEIGHT, y: event.deltaY * LINE_HEIGHT };
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return {
      x: event.deltaX * LINE_HEIGHT * 10,
      y: event.deltaY * LINE_HEIGHT * 10,
    };
  }

  return { x: event.deltaX, y: event.deltaY };
}

/**
 * The stored scale and offset are requests, not facts: both are clamped here, so
 * a resize re-resolves rather than stranding the frame.
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

  // Floored at cover so a step always fills the stage — a capture smaller than
  // the stage would otherwise "zoom" to letterboxing.
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
