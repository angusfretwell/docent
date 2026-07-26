import { autoScrollAtom } from "@client/lib/preferences";
import { useAtomValue } from "jotai/react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AnchorPlacement, ProseExtent, ProseView } from "../lib/reading";
import { extentToRead, nudgeIntoRead, targetUnderRead } from "../lib/reading";

/** Fallback for browsers that don't fire `scrollend`, and for a nudge with nowhere to travel. */
const SETTLE_MS = 700;

/** How long a reading has to stand before the pane follows it, so a flick through the prose lands once rather than at every anchor on the way. */
const DWELL_MS = 150;

const TARGET_ATTRIBUTE = "data-walkthrough-target";

export function targetAnchorProps(key: string) {
  return { "data-walkthrough-target": key };
}

function viewOf(container: HTMLElement): ProseView {
  return {
    height: container.clientHeight,
    remaining:
      container.scrollHeight - container.clientHeight - container.scrollTop,
  };
}

function placementsIn(container: HTMLElement): AnchorPlacement[] {
  const view = container.getBoundingClientRect();

  return [...container.querySelectorAll(`[${TARGET_ATTRIBUTE}]`)].flatMap(
    (anchor) => {
      const key = anchor.getAttribute(TARGET_ATTRIBUTE);

      return key === null
        ? []
        : [{ key, top: anchor.getBoundingClientRect().top - view.top }];
    }
  );
}

/**
 * The anchor and everything enclosing it, innermost first: its paragraph or chip
 * row, then its section, then the column they all sit in. Where to stop is left
 * to what the viewport can hold — the outer wrappers span the whole tour, so they
 * are never a run anything could be read from.
 */
function extentsAround(anchor: Element, container: HTMLElement): ProseExtent[] {
  const view = container.getBoundingClientRect();
  const extents: ProseExtent[] = [];

  for (
    let node: Element | null = anchor;
    node !== null && node !== container;
    node = node.parentElement
  ) {
    const rect = node.getBoundingClientRect();

    extents.push({ bottom: rect.bottom - view.top, top: rect.top - view.top });
  }

  return extents;
}

export interface ActiveTarget {
  activeKey: string | undefined;
  /** Show a target without moving the prose. */
  pinTarget: (key: string) => void;
  /** Step to a target the reader named in the target pane; the prose follows while auto-scroll is on. */
  jumpToTarget: (key: string) => void;
  /** Report where reading the target pane has arrived; nothing moves while auto-scroll is off. */
  reachTarget: (key: string) => void;
}

/**
 * `resetKey` re-reads when the rendered tour changes: switching walkthroughs
 * replaces every anchor, so the previous reading no longer refers to anything.
 *
 * Reading the prose carries the pane by where the prose stands, not by anchors
 * crossing an edge (see `targetUnderRead`). A target named from the other pane
 * overrides that reading and holds until the reader's own scrolling reads onto a
 * different anchor, so a named target survives both the nudge that brought it
 * into view and the next flick of the wheel.
 *
 * Auto-scroll governs both directions of reading: with it off neither pane
 * carries the other, and stepping the target pane by hand leaves the prose where
 * the reader left it.
 */
export function useActiveTarget(
  containerRef: RefObject<HTMLElement | null>,
  resetKey: string
): ActiveTarget {
  const [activeKey, setActiveKey] = useState<string>();

  // Refs because the reading outlives the render that set it up.
  const active = useRef<string | null>(null);
  const pending = useRef<string | null>(null);
  const held = useRef<{ baseline: string | undefined } | null>(null);
  const arriving = useRef(false);
  const dwell = useRef(0);
  const settle = useRef(0);
  const frame = useRef(0);

  // A ref, not a dependency: re-running the effect would clear the active target,
  // so toggling auto-scroll mid-tour would blank the pane it governs.
  const autoScroll = useAtomValue(autoScrollAtom);
  const following = useRef(autoScroll);

  useEffect(() => {
    following.current = autoScroll;
  }, [autoScroll]);

  const readingNow = useCallback(() => {
    const container = containerRef.current;

    return container === null
      ? undefined
      : targetUnderRead(placementsIn(container), viewOf(container));
  }, [containerRef]);

  const commit = useCallback((key: string) => {
    window.clearTimeout(dwell.current);
    pending.current = null;
    active.current = key;
    setActiveKey(key);
  }, []);

  /* `scrollend` is the real signal that a nudge has landed; the timer covers
     browsers that don't fire it and the nudge that has nowhere to travel. The
     reading it lands on is the one the reader has to move off before their
     scrolling takes the pane back. */
  const land = useCallback(() => {
    if (!arriving.current) {
      return;
    }

    window.clearTimeout(settle.current);
    arriving.current = false;

    if (held.current !== null) {
      held.current = { baseline: readingNow() };
    }
  }, [readingNow]);

  const show = useCallback(
    (key: string, follow: boolean) => {
      commit(key);

      const container = containerRef.current;

      if (container === null) {
        held.current = { baseline: undefined };
        return;
      }

      const view = viewOf(container);

      held.current = {
        baseline: targetUnderRead(placementsIn(container), view),
      };

      const anchor = container.querySelector(
        `[${TARGET_ATTRIBUTE}="${CSS.escape(key)}"]`
      );

      if (!follow || anchor === null) {
        return;
      }

      const extent = extentToRead(extentsAround(anchor, container), view);
      const nudge = extent === undefined ? 0 : nudgeIntoRead(extent, view);

      if (nudge === 0) {
        return;
      }

      arriving.current = true;
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(land, SETTLE_MS);

      container.scrollTo({
        behavior: "smooth",
        top: container.scrollTop + nudge,
      });
    },
    [commit, containerRef, land]
  );

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    active.current = null;
    pending.current = null;
    held.current = null;
    setActiveKey(undefined);

    function measure() {
      if (arriving.current) {
        return;
      }

      const reading = readingNow();

      if (reading === undefined) {
        return;
      }

      // Opening the tour is where the pane starts, not somewhere reading carried
      // it, so auto-scroll only governs what comes after — off from the first
      // frame would otherwise leave the pane with nothing in it.
      if (!following.current && active.current !== null) {
        return;
      }

      if (held.current !== null) {
        if (reading === held.current.baseline) {
          return;
        }

        held.current = null;
      }

      if (reading === active.current) {
        window.clearTimeout(dwell.current);
        pending.current = null;
        return;
      }

      // A reading already waiting out its dwell keeps its timer, so a scroll that
      // never pauses still lands rather than deferring itself indefinitely.
      if (reading === pending.current) {
        return;
      }

      pending.current = reading;
      window.clearTimeout(dwell.current);
      dwell.current = window.setTimeout(() => commit(reading), DWELL_MS);
    }

    function remeasure() {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(measure);
    }

    measure();

    container.addEventListener("scroll", remeasure, { passive: true });
    container.addEventListener("scrollend", land);

    // Prose reflows as markdown, images, and the panel split settle, which moves
    // every anchor without a scroll ever firing.
    const observer = new ResizeObserver(remeasure);
    observer.observe(container);

    return () => {
      window.clearTimeout(dwell.current);
      window.clearTimeout(settle.current);
      cancelAnimationFrame(frame.current);
      arriving.current = false;
      container.removeEventListener("scroll", remeasure);
      container.removeEventListener("scrollend", land);
      observer.disconnect();
    };
  }, [commit, containerRef, land, readingNow, resetKey]);

  const pinTarget = useCallback(
    (key: string) => {
      show(key, false);
    },
    [show]
  );

  const jumpToTarget = useCallback(
    (key: string) => {
      show(key, following.current);
    },
    [show]
  );

  const reachTarget = useCallback(
    (key: string) => {
      if (!following.current) {
        return;
      }

      show(key, true);
    },
    [show]
  );

  return { activeKey, jumpToTarget, pinTarget, reachTarget };
}
