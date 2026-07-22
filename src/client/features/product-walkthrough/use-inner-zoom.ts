/**
 * Map-style zoom and pan for a capture held in a fixed stage. The image starts
 * fitted; the wheel, a pinch, or a double-click scale it up, and dragging moves
 * it around, with a flick gliding to a stop the way a map does. Nothing about it
 * is modal — there is no zoom "mode" to enter, just a scale the reader pushes
 * around.
 *
 * Every scale change routes through one anchored transform: the image point
 * under the pointer is the point that stays put. That is what keeps a zoom
 * converging on whatever the reader is aiming at rather than drifting off it,
 * and it is the same call whether the gesture was a wheel, a pinch, or a
 * double-click.
 *
 * The whole geometry is one pure function of stage size and view, so the render
 * and the gesture handlers derive it the same way — the handlers off refs, since
 * they outlive the render that created them, and the render off state.
 *
 * Sizing is measured rather than left to `object-contain` because the frame
 * carries the region pins as well as the image: pins are percentages of the
 * frame, so the frame has to be exactly the rendered image on both axes or the
 * marks stretch off their regions. An explicit width/height guarantees that at
 * any scale.
 *
 * @see https://use-gesture.netlify.app/docs/options/#target — the `target` +
 * non-passive `eventOptions` pairing, without which the wheel handler cannot
 * `preventDefault` and the panel scrolls behind the zoom.
 */

import { useMediaQuery } from "@client/hooks/use-media-query";
import { useGesture } from "@use-gesture/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * How large a double-click step zooms relative to the size the capture was taken
 * at. 1 renders a screenshot pixel-for-pixel as the app was drawn, which is the
 * point of zooming one — text lands at the size it was really read at.
 */
const STEP_SCALE = 1;

/** What one double-click multiplies the scale by. */
const STEP_FACTOR = 2;

/** How far past the captured size the wheel and pinch can push. */
const MAX_SCALE = 4;

/** Wheel travel to e-fold the scale: an exponent keeps each notch proportional. */
const WHEEL_SENSITIVITY = 0.002;

/** A line-mode wheel notch in pixels, for the browsers that report lines. */
const LINE_HEIGHT = 16;

/** Share of the stage kept clear around a framed region, per side. */
const FRAME_PADDING = 0.12;

/** How long a discrete zoom step — double-click, keyboard — eases over. */
const ZOOM_DURATION = 300;

/** Milliseconds for a glide's speed to decay by `e` — iOS-ish momentum. */
const GLIDE_DECAY = 150;

/** Speed in px/ms below which a glide has arrived and the loop can stop. */
const GLIDE_FLOOR = 0.02;

/** Longest frame a glide will integrate over, so a stalled tab doesn't teleport it. */
const MAX_FRAME = 64;

interface Offset {
  x: number;
  y: number;
}

interface Size {
  height: number;
  width: number;
}

/** What the reader has done to the capture: how far in, and pushed how far off-centre. */
interface View {
  offset: Offset;
  scale: number;
}

/** Where the frame lands, and the limits the gestures are allowed to move it between. */
interface Geometry {
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

export interface InnerZoom {
  /** Whether a pan is under way — a press that has travelled, not merely a press. */
  dragging: boolean;
  /** Zoom to and centre on a region of the capture, in normalized (0..1) coordinates. */
  frameRect: (rect: readonly [number, number, number, number]) => void;
  /** Position and size for the frame holding the capture and its pins. */
  frameStyle: { height: number; left: number; top: number; width: number };
  /**
   * Whether the stage has been measured. Until it has there is no geometry to
   * place anything against, so a caller with a view to restore has to wait.
   */
  measured: boolean;
  /** Ease back out to the whole capture, fitted and centred on the stage. */
  refit: () => void;
  /**
   * How far the capture is scaled from its natural size. A raster only needs the
   * sized frame, but reconstructed DOM has to be scaled by transform to stay
   * vector-sharp, and that wants the factor itself.
   */
  scale: number;
  /** Ref and double-click handler for the stage; the other gestures bind themselves. */
  stageProps: {
    onDoubleClick: (event: React.MouseEvent<HTMLElement>) => void;
    ref: React.RefObject<HTMLDivElement | null>;
  };
  /** Step between fitted and zoomed from the keyboard, about the stage's centre. */
  toggle: () => void;
  /** Whether zooming would show the image any larger than the fitted frame. */
  zoomable: boolean;
  /** Whether the frame is scaled up from its fitted size. */
  zoomed: boolean;
}

/** Clamp one axis into `[slack, 0]` when the frame overflows, or centre it when it doesn't. */
function clampAxis(value: number, slack: number) {
  if (slack >= 0) {
    return slack / 2;
  }

  return Math.min(Math.max(value, slack), 0);
}

/** Wheel deltas arrive in pixels, lines, or pages depending on the device. */
function wheelPixels(event: WheelEvent) {
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
function measure(
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

/** @param natural - the image's own pixel size, `[width, height]`. */
export function useInnerZoom(natural: readonly [number, number]): InnerZoom {
  const stageRef = useRef<HTMLDivElement>(null);
  // One animation slot for both the glide and the zoom tween, so starting
  // either — or any direct gesture — cancels whatever was already running.
  const animation = useRef<number | null>(null);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Each piece of the view is held twice on purpose: as state, which the render
  // reads, and as a ref, which the gesture handlers and the animation loops read
  // because they outlive the render that created them. `commit` is the only
  // writer, so the two never drift.
  const sizeRef = useRef<Size>({ height: 0, width: 0 });
  const [size, setSize] = useState<Size>({ height: 0, width: 0 });
  const viewRef = useRef<View>({ offset: { x: 0, y: 0 }, scale: 0 });
  const [view, setView] = useState<View>({ offset: { x: 0, y: 0 }, scale: 0 });
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const element = stageRef.current;

    if (element === null) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const next = {
        height: element.clientHeight,
        width: element.clientWidth,
      };

      sizeRef.current = next;
      setSize(next);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (animation.current !== null) {
        cancelAnimationFrame(animation.current);
      }
    },
    []
  );

  const geometry = measure(natural, size, view);

  function commit(next: View) {
    viewRef.current = next;
    setView(next);
  }

  /** The geometry as it stands right now, for handlers that outlive their render. */
  function current() {
    return measure(natural, sizeRef.current, viewRef.current);
  }

  function stopAnimation() {
    if (animation.current !== null) {
      cancelAnimationFrame(animation.current);
      animation.current = null;
    }
  }

  /** Carry a flick's velocity on into a decaying glide, stopping dead at an edge. */
  function startGlide(velocity: Offset) {
    stopAnimation();

    let previous = performance.now();
    let speedX = velocity.x;
    let speedY = velocity.y;

    function step(now: number) {
      const elapsed = Math.min(now - previous, MAX_FRAME);
      previous = now;

      const decay = Math.exp(-elapsed / GLIDE_DECAY);
      speedX *= decay;
      speedY *= decay;

      const from = current();
      const travelledX = from.placed.x + speedX * elapsed;
      const travelledY = from.placed.y + speedY * elapsed;
      const nextX = clampAxis(travelledX, from.slackX);
      const nextY = clampAxis(travelledY, from.slackY);

      // An edge absorbs the glide rather than letting it press on invisibly.
      if (nextX !== travelledX) {
        speedX = 0;
      }
      if (nextY !== travelledY) {
        speedY = 0;
      }

      commit({ offset: { x: nextX, y: nextY }, scale: viewRef.current.scale });

      if (Math.hypot(speedX, speedY) < GLIDE_FLOOR) {
        animation.current = null;
        return;
      }

      animation.current = requestAnimationFrame(step);
    }

    animation.current = requestAnimationFrame(step);
  }

  /**
   * Rescale about a stage-relative anchor, holding the image point under it
   * still. Below the fitted scale the frame recentres, so there is no way to
   * strand it off-centre by zooming out.
   */
  function scaleTo(next: number, anchor: Offset) {
    const from = current();
    const target = Math.min(Math.max(next, from.fitScale), from.maxScale);

    const imageX = (anchor.x - from.placed.x) / from.scale;
    const imageY = (anchor.y - from.placed.y) / from.scale;

    commit({
      offset: {
        x: anchor.x - imageX * target,
        y: anchor.y - imageY * target,
      },
      scale: target,
    });
  }

  /**
   * Ease from wherever the frame sits now to a resolved view. Interpolating the
   * offset on the same parameter as the scale is what holds an anchored zoom
   * still for the whole tween: an anchored pair of endpoints both satisfy
   * `offset = anchor - imagePoint * scale`, and that relation is affine in the
   * scale, so every point between them satisfies it too.
   */
  function animate(to: View) {
    stopAnimation();

    const from = current();

    if (reduceMotion) {
      commit(to);
      return;
    }

    const start = performance.now();

    function step(now: number) {
      const progress = Math.min((now - start) / ZOOM_DURATION, 1);
      const eased = 1 - (1 - progress) ** 3;

      commit({
        offset: {
          x: from.placed.x + (to.offset.x - from.placed.x) * eased,
          y: from.placed.y + (to.offset.y - from.placed.y) * eased,
        },
        scale: from.scale + (to.scale - from.scale) * eased,
      });

      if (progress === 1) {
        animation.current = null;
        return;
      }

      animation.current = requestAnimationFrame(step);
    }

    animation.current = requestAnimationFrame(step);
  }

  /** A discrete zoom step — double-click, keyboard — eased in about an anchor. */
  function animateTo(next: number, anchor: Offset) {
    const from = current();
    const target = Math.min(Math.max(next, from.fitScale), from.maxScale);
    const imageX = (anchor.x - from.placed.x) / from.scale;
    const imageY = (anchor.y - from.placed.y) / from.scale;

    animate({
      offset: { x: anchor.x - imageX * target, y: anchor.y - imageY * target },
      scale: target,
    });
  }

  /**
   * Bring one annotated region of the image to the middle of the stage, zoomed
   * far enough to read it but never past the ceiling. The rect is normalized to
   * the capture (0..1), the same coordinate the overlays are positioned in, so a
   * pin can hand its own rect straight over.
   */
  function frameRect(rect: readonly [number, number, number, number]) {
    const from = current();
    const stage = sizeRef.current;
    const [naturalWidth, naturalHeight] = natural;

    const regionWidth = rect[2] * naturalWidth;
    const regionHeight = rect[3] * naturalHeight;

    // A degenerate rect would divide out to Infinity, which the clamp turns
    // into the ceiling — the right answer for a region with no extent.
    const scale = Math.min(
      Math.max(
        Math.min(
          (stage.width * (1 - 2 * FRAME_PADDING)) / regionWidth,
          (stage.height * (1 - 2 * FRAME_PADDING)) / regionHeight
        ),
        from.fitScale
      ),
      from.maxScale
    );

    const centreX = (rect[0] + rect[2] / 2) * naturalWidth;
    const centreY = (rect[1] + rect[3] / 2) * naturalHeight;

    animate({
      offset: {
        x: stage.width / 2 - centreX * scale,
        y: stage.height / 2 - centreY * scale,
      },
      scale,
    });
  }

  /** Client coordinates into stage-relative ones, for anchoring a scale change. */
  function toStage(clientX: number, clientY: number): Offset {
    const rect = stageRef.current?.getBoundingClientRect();

    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }

  useGesture(
    {
      onDrag: ({ direction, first, last, memo, movement, tap, velocity }) => {
        // A tap still arrives here as the gesture's final event, with the
        // intervening moves filtered out — so there is no `memo` from a first
        // event to carry, and nothing to pan.
        if (tap) {
          return;
        }

        // `filterTaps` holds the gesture back until the press has travelled, so
        // by the time a first event lands this is a real pan and not a click.
        if (first) {
          setDragging(true);
        }

        const origin: Offset =
          first || memo === undefined ? current().placed : memo;

        commit({
          offset: { x: origin.x + movement[0], y: origin.y + movement[1] },
          scale: viewRef.current.scale,
        });

        if (last) {
          setDragging(false);
          startGlide({
            x: velocity[0] * direction[0],
            y: velocity[1] * direction[1],
          });
        }

        return origin;
      },
      onDragStart: stopAnimation,
      // Trackpad pinch and touch pinch both land here; `origin` is the midpoint
      // of the touches, or the cursor when the trackpad reports it as ctrl+wheel.
      onPinch: ({ offset: [pinched], origin }) => {
        stopAnimation();
        scaleTo(pinched, toStage(origin[0], origin[1]));
      },
      // A ctrl-modified wheel *is* the trackpad pinch, already handled above.
      onWheel: ({ event }) => {
        if (event.ctrlKey) {
          return;
        }

        stopAnimation();
        scaleTo(
          current().scale * Math.exp(-wheelPixels(event) * WHEEL_SENSITIVITY),
          toStage(event.clientX, event.clientY)
        );
      },
    },
    {
      // Only the wheel and the pinch cancel their events — they are the ones
      // fighting the page scroll and the browser's own zoom. Cancelling the
      // drag's `pointerdown` would suppress the compatibility mouse events the
      // browser builds `dblclick` from, taking the double-click zoom with it.
      drag: { filterTaps: true },
      eventOptions: { passive: false },
      pinch: {
        from: () => [current().scale, 0],
        preventDefault: true,
        scaleBounds: () => {
          const limits = current();

          return { max: limits.maxScale, min: limits.fitScale };
        },
      },
      target: stageRef,
      wheel: { preventDefault: true },
    }
  );

  const zoomed = geometry.scale > geometry.fitScale;

  return {
    dragging,
    frameRect,
    frameStyle: {
      height: geometry.height,
      left: geometry.placed.x,
      top: geometry.placed.y,
      width: geometry.width,
    },
    measured: size.width > 0 && size.height > 0,
    // Anchored on the stage's centre, as stepping out from the keyboard is: a
    // scale under the fitting one clamps to it, so 0 asks for the whole capture.
    refit: () => animateTo(0, { x: size.width / 2, y: size.height / 2 }),
    scale: geometry.scale,
    stageProps: {
      onDoubleClick: (event) => {
        const from = current();
        // A held modifier steps back out, the way a map's double-click does.
        const factor =
          event.altKey || event.shiftKey ? 1 / STEP_FACTOR : STEP_FACTOR;
        const base =
          from.scale > from.fitScale ? from.scale : from.stepScale / factor;

        animateTo(base * factor, toStage(event.clientX, event.clientY));
      },
      ref: stageRef,
    },
    toggle: () => {
      const from = current();

      animateTo(zoomed ? 0 : from.stepScale, {
        x: size.width / 2,
        y: size.height / 2,
      });
    },
    zoomable: geometry.stepScale > geometry.fitScale,
    zoomed,
  };
}
