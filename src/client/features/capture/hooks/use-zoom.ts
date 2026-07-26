/**
 * @see https://use-gesture.netlify.app/docs/options/#target — the `target` +
 * non-passive `eventOptions` pairing, without which the wheel handler cannot
 * `preventDefault` and the panel scrolls behind the zoom.
 */

import { useMediaQuery } from "@client/hooks/use-media-query";
import { useGesture } from "@use-gesture/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Offset, Size, View } from "../lib/zoom-geometry";
import { measure, wheelDelta } from "../lib/zoom-geometry";

const FRAME_PADDING = 0.12;

const ZOOM_DURATION_MS = 300;

const DOUBLE_TAP_MS = 300;

/** How far a press may travel and still count as a tap rather than a pan. */
const TAP_SLOP = 5;

/** How far apart two taps may land and still read as one double tap. */
const DOUBLE_TAP_SLOP = 16;

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
  stageProps: { ref: React.RefObject<HTMLDivElement | null> };
  toggle: () => void;
  zoomable: boolean;
  zoomed: boolean;
}

/** @param natural - the image's own pixel size, `[width, height]`. */
export function useZoom(natural: readonly [number, number]): Zoom {
  const stageRef = useRef<HTMLDivElement>(null);
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

  const pinching = useRef(false);
  const tapped = useRef<{ at: number; x: number; y: number } | null>(null);

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

  function centre(): Offset {
    return { x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 };
  }

  function toStage(clientX: number, clientY: number): Offset {
    const rect = stageRef.current?.getBoundingClientRect();

    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }

  /**
   * Rescale about a stage-relative anchor, holding the image point under it
   * still. `was` is where that anchor sat on the previous event, so two fingers
   * pan the capture as they pinch it. Below the fitted scale it recentres, so
   * zooming out can't strand the frame off-centre.
   */
  function scaleTo(next: number, anchor: Offset, was: Offset) {
    const from = current();
    const target = Math.min(Math.max(next, from.fitScale), from.maxScale);

    const imageX = (was.x - from.placed.x) / from.scale;
    const imageY = (was.y - from.placed.y) / from.scale;

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

  /** A scale under the fitting one clamps to it, so 0 asks for the whole capture, centred. */
  function toggleAt(anchor: Offset) {
    const from = current();

    animateTo(from.scale > from.fitScale ? 0 : from.stepScale, anchor);
  }

  /**
   * `dblclick` never arrives from a finger, so the second activation is counted
   * here for every pointer alike rather than left to the browser for some.
   */
  function registerTap(x: number, y: number) {
    const now = performance.now();
    const previous = tapped.current;
    const repeat =
      previous !== null &&
      now - previous.at < DOUBLE_TAP_MS &&
      Math.hypot(x - previous.x, y - previous.y) < DOUBLE_TAP_SLOP;

    tapped.current = repeat ? null : { at: now, x, y };

    if (repeat) {
      toggleAt(toStage(x, y));
    }
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

  useGesture(
    {
      onDrag: ({ first, last, memo, movement, tap, xy }) => {
        // A tap still arrives as the gesture's final event with moves filtered
        // out, so there is no `memo` to carry and nothing to pan.
        if (tap) {
          registerTap(xy[0], xy[1]);
          return;
        }

        // Two fingers down is a pinch, which pans on its own account. The origin
        // is re-seated as it goes, so lifting back to one finger carries on from
        // wherever the pinch left the capture.
        if (pinching.current) {
          const held = current().placed;

          return { x: held.x - movement[0], y: held.y - movement[1] };
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
        }

        return origin;
      },
      onDragStart: stopAnimation,
      // Trackpad and touch pinch both land here; `origin` is the touch midpoint,
      // or the cursor for a trackpad ctrl+wheel.
      onPinch: ({ first, last, memo, offset: [pinched], origin }) => {
        const anchor = toStage(origin[0], origin[1]);

        if (first) {
          stopAnimation();
          pinching.current = true;
        }

        scaleTo(pinched, anchor, memo ?? anchor);

        if (last) {
          pinching.current = false;
        }

        return anchor;
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
      drag: { filterTaps: true, tapsThreshold: TAP_SLOP },
      eventOptions: { passive: false },
      pinch: {
        from: () => [current().scale, 0],
        // Touch events rather than pointer events: only a cancelled `touchmove`
        // stops iOS Safari taking a two-finger gesture for its own page zoom.
        pointer: { touch: true },
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
    refit: () => animateTo(0, centre()),
    scale: geometry.scale,
    stageProps: { ref: stageRef },
    toggle: () => toggleAt(centre()),
    zoomable: geometry.stepScale > geometry.fitScale,
    zoomed: geometry.scale > geometry.fitScale,
  };
}
