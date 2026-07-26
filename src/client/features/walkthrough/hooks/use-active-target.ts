import { autoScrollAtom } from "@client/lib/preferences";
import { useAtomValue } from "jotai/react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const READ_LINE_FRACTION = 1 / 3;

/** Fallback timeout for browsers that don't fire `scrollend`. */
const SETTLE_MS = 700;

const TARGET_ATTRIBUTE = "data-walkthrough-target";

export function targetAnchorProps(key: string) {
  return { "data-walkthrough-target": key };
}

function anchorKeyOf(element: Element): string | undefined {
  return element.getAttribute(TARGET_ATTRIBUTE) ?? undefined;
}

function anchorsIn(container: HTMLElement): Element[] {
  return [...container.querySelectorAll(`[${TARGET_ATTRIBUTE}]`)];
}

export function visibleTargetsIn(container: HTMLElement): string[] {
  const view = container.getBoundingClientRect();

  return anchorsIn(container)
    .filter((anchor) => {
      const rect = anchor.getBoundingClientRect();

      return rect.bottom >= view.top && rect.top <= view.bottom;
    })
    .map(anchorKeyOf)
    .filter((key) => key !== undefined);
}

function scrollTargetIntoRead(container: HTMLElement, key: string): void {
  const anchor = anchorsIn(container).find(
    (candidate) => anchorKeyOf(candidate) === key
  );

  if (anchor === undefined) {
    return;
  }

  const offset =
    anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;

  container.scrollTo({
    behavior: "smooth",
    top:
      container.scrollTop +
      offset -
      container.clientHeight * READ_LINE_FRACTION,
  });
}

export interface ActiveTarget {
  activeKey: string | undefined;
  /** Show a target without moving the prose. */
  pinTarget: (key: string) => void;
  /** Step to a target the reader named in the target pane; the prose follows while auto-scroll is on, and anchors passed on the way don't become active. */
  jumpToTarget: (key: string) => void;
  /** Report where reading the target pane has arrived; nothing moves while auto-scroll is off. */
  reachTarget: (key: string) => void;
}

/**
 * `resetKey` re-observes when the rendered tour changes: switching walkthroughs
 * replaces every anchor, so the previous reading no longer refers to anything.
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

  // Refs because the measuring outlives the render that set it up: `arrive` is
  // how a jump tells the measuring to keep quiet until it lands.
  const arriving = useRef(false);
  const arrive = useRef<(() => void) | null>(null);

  // A ref, not a dependency: re-running the effect would clear the active target,
  // so toggling auto-scroll mid-tour would blank the pane it governs.
  const autoScroll = useAtomValue(autoScrollAtom);
  const following = useRef(autoScroll);

  useEffect(() => {
    following.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    setActiveKey(undefined);

    let showing = new Set<string>();
    let opened = false;
    let previousTop = container.scrollTop;
    let settle = 0;
    let frame = 0;

    /* `scrollend` is the real signal that a jump has landed; the timer covers
       browsers that don't fire it and the jump that has nowhere to travel. */
    function settled() {
      clearTimeout(settle);
      arriving.current = false;
    }

    arrive.current = () => {
      arriving.current = true;
      clearTimeout(settle);
      settle = window.setTimeout(settled, SETTLE_MS);
    };

    function measure() {
      const element = containerRef.current;

      if (element === null) {
        return;
      }

      const showingNow = visibleTargetsIn(element);
      const arrived = showingNow.filter((key) => !showing.has(key));

      const descending = element.scrollTop >= previousTop;
      previousTop = element.scrollTop;
      showing = new Set(showingNow);

      if (arrived.length === 0 || arriving.current) {
        return;
      }

      // Opening the tour is where the pane starts, not somewhere reading carried
      // it, so auto-scroll only governs what comes after — off from the first
      // frame would otherwise leave the pane with nothing in it.
      if (opened && !following.current) {
        return;
      }

      // The furthest arrival along the reader's direction of travel is the one
      // reached; the rest are behind them, so a fast scroll still lands right.
      // The tour opening is neither direction: the whole first screen arrives at
      // once and the reader is at the top of it.
      const towardsTheEnd = opened && descending;
      const reached = towardsTheEnd ? arrived.at(-1) : arrived[0];

      opened = true;

      if (reached !== undefined) {
        setActiveKey(reached);
      }
    }

    function remeasure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }

    measure();

    container.addEventListener("scroll", remeasure, { passive: true });
    container.addEventListener("scrollend", settled);

    // Prose reflows as markdown, images, and the panel split settle, which moves
    // every anchor without a scroll ever firing.
    const observer = new ResizeObserver(remeasure);
    observer.observe(container);

    return () => {
      clearTimeout(settle);
      cancelAnimationFrame(frame);
      arrive.current = null;
      arriving.current = false;
      container.removeEventListener("scroll", remeasure);
      container.removeEventListener("scrollend", settled);
      observer.disconnect();
    };
  }, [containerRef, resetKey]);

  const pinTarget = useCallback((key: string) => {
    setActiveKey(key);
  }, []);

  const jumpToTarget = useCallback(
    (key: string) => {
      const container = containerRef.current;

      setActiveKey(key);

      if (container !== null && following.current) {
        arrive.current?.();
        scrollTargetIntoRead(container, key);
      }
    },
    [containerRef]
  );

  const reachTarget = useCallback(
    (key: string) => {
      if (!following.current) {
        return;
      }

      jumpToTarget(key);
    },
    [jumpToTarget]
  );

  return { activeKey, jumpToTarget, pinTarget, reachTarget };
}
