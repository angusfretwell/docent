/**
 * @see https://use-gesture.netlify.app/docs/options/#target — the `target` +
 * non-passive `eventOptions` pairing, without which the wheel handler cannot
 * `preventDefault` and the panel scrolls behind the zoom.
 */

import { useMediaQuery } from "@client/hooks/use-media-query";
import { useGesture } from "@use-gesture/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Offset, Size, View } from "../lib/zoom-geometry";
import { clampAxis, measure, wheelDelta } from "../lib/zoom-geometry";

const STEP_FACTOR = 2;

const FRAME_PADDING = 0.12;

const ZOOM_DURATION_MS = 300;

const GLIDE_DECAY_MS = 150;

const GLIDE_FLOOR = 0.02;

/** Capped so a stalled tab's long frame doesn't teleport the glide. */
const MAX_FRAME_MS = 64;

export interface Zoom {
  dragging: boolean;
  /** `rect` is normalized (0..1) capture coordinates. */
  frameRect: (rect: readonly [number, number, number, number]) => void;
  frameStyle: { height: number; left: number; top: number; width: number };
  /** Until measured there is no geometry, so a caller with a view to restore must wait. */
  measured: boolean;
  refit: () => void;
  /** Reconstructed DOM is scaled by transform to stay vector-sharp, so callers need the factor. */
  scale: number;
  stageProps: {
    onDoubleClick: (event: React.MouseEvent<HTMLElement>) => void;
    ref: React.RefObject<HTMLDivElement | null>;
  };
  toggle: () => void;
  zoomable: boolean;
  zoomed: boolean;
}

/** @param natural - the image's own pixel size, `[width, height]`. */
export function useZoom(natural: readonly [number, number]): Zoom {
  const stageRef = useRef<HTMLDivElement>(null);
  // One slot for both the glide and the zoom tween, so starting either — or any
  // direct gesture — cancels whatever was already running.
  const animation = useRef<number | null>(null);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Each piece of the view is held twice: as state for the render, and as a ref
  // for the gesture handlers and animation loops that outlive their render.
  // `commit` is the only writer, so the two never drift.
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

  /** Geometry as it stands now, for handlers that outlive their render. */
  function current() {
    return measure(natural, sizeRef.current, viewRef.current);
  }

  function stopAnimation() {
    if (animation.current !== null) {
      cancelAnimationFrame(animation.current);
      animation.current = null;
    }
  }

  function startGlide(velocity: Offset) {
    stopAnimation();

    let previous = performance.now();
    let speedX = velocity.x;
    let speedY = velocity.y;

    function step(now: number) {
      const elapsed = Math.min(now - previous, MAX_FRAME_MS);
      previous = now;

      const decay = Math.exp(-elapsed / GLIDE_DECAY_MS);
      speedX *= decay;
      speedY *= decay;

      const from = current();
      const travelledX = from.placed.x + speedX * elapsed;
      const travelledY = from.placed.y + speedY * elapsed;
      const nextX = clampAxis(travelledX, from.slackX);
      const nextY = clampAxis(travelledY, from.slackY);

      // An edge absorbs the glide rather than pressing on invisibly.
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
   * still. Below the fitted scale it recentres, so zooming out can't strand the
   * frame off-centre.
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
   * Interpolating the offset on the same parameter as the scale holds an
   * anchored zoom still for the whole tween: the relation
   * `offset = anchor - imagePoint * scale` is affine in the scale, so every
   * interpolated point satisfies it too.
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
      const progress = Math.min((now - start) / ZOOM_DURATION_MS, 1);
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
   * The rect is normalized to the capture (0..1), the same coordinate the
   * overlays use, so a pin can hand its own rect over.
   */
  function frameRect(rect: readonly [number, number, number, number]) {
    const from = current();
    const stage = sizeRef.current;
    const [naturalWidth, naturalHeight] = natural;

    const regionWidth = rect[2] * naturalWidth;
    const regionHeight = rect[3] * naturalHeight;

    // A degenerate rect divides out to Infinity, which the clamp turns into the
    // ceiling — right for a region with no extent.
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

  function toStage(clientX: number, clientY: number): Offset {
    const rect = stageRef.current?.getBoundingClientRect();

    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }

  useGesture(
    {
      onDrag: ({ direction, first, last, memo, movement, tap, velocity }) => {
        // A tap still arrives as the gesture's final event with moves filtered
        // out, so there is no `memo` to carry and nothing to pan.
        if (tap) {
          return;
        }

        // `filterTaps` holds the gesture back until the press has travelled, so
        // a first event here is a real pan, not a click.
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
      // Trackpad and touch pinch both land here; `origin` is the touch midpoint,
      // or the cursor for a trackpad ctrl+wheel.
      onPinch: ({ offset: [pinched], origin }) => {
        stopAnimation();
        scaleTo(pinched, toStage(origin[0], origin[1]));
      },
      // A ctrl-modified wheel is the trackpad pinch, already handled by onPinch.
      // A plain two-finger swipe pans the capture, the same as dragging it.
      onWheel: ({ event }) => {
        if (event.ctrlKey) {
          return;
        }

        stopAnimation();

        const from = current();
        const delta = wheelDelta(event);

        commit({
          offset: {
            x: from.placed.x - delta.x,
            y: from.placed.y - delta.y,
          },
          scale: viewRef.current.scale,
        });
      },
    },
    {
      // Only wheel and pinch cancel their events. Cancelling the drag's
      // `pointerdown` would suppress the compatibility mouse events the browser
      // builds `dblclick` from, taking the double-click zoom with it.
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
    // A scale under the fitting one clamps to it, so 0 asks for the whole
    // capture, centred.
    refit: () => animateTo(0, { x: size.width / 2, y: size.height / 2 }),
    scale: geometry.scale,
    stageProps: {
      onDoubleClick: (event) => {
        const from = current();
        // A held modifier steps back out, like a map's double-click.
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
