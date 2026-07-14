/**
 * Which walkthrough target the reader is currently on — the signal that keeps
 * the target panel in step with the prose panel.
 *
 * The prose renders a chip at each `{{range:i}}` / `{{capture:i}}` position (see
 * `lib/walkthrough.ts`), tagged with `data-walkthrough-target`. Reading those
 * out of the DOM rather than threading a ref per chip keeps the chips themselves
 * inert markup and gives document order for free.
 *
 * The active target changes on one event only: **a new anchor coming into
 * view**. It is not a reading taken from the scroll position, which would make
 * every scroll an answer and leave the panel with no way to stay put. Making
 * arrival the trigger gives the tour two properties at once — reading on brings
 * the next target with it, and a target asked for deliberately stays until the
 * reader has actually travelled far enough to reach a different one.
 *
 * A deliberate jump therefore does not scroll the prose to agree with the panel.
 * Asking to see a target is not asking to be moved somewhere, and a jump that
 * scrolled would be undone by the scroll it caused.
 */

import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Where in the panel a jumped-to target is put, as a fraction of its height. */
const READ_LINE = 1 / 3;

/** Longest a smooth scroll is given to arrive where `scrollend` is not fired. */
const SETTLE_MS = 700;

const TARGET_ATTRIBUTE = "data-walkthrough-target";

/** The attribute a prose anchor carries so this hook can find it. */
export function targetAnchorProps(key: string) {
  return { "data-walkthrough-target": key };
}

function anchorKeyOf(element: Element): string | undefined {
  return element.getAttribute(TARGET_ATTRIBUTE) ?? undefined;
}

function anchorsIn(container: HTMLElement): Element[] {
  return [...container.querySelectorAll(`[${TARGET_ATTRIBUTE}]`)];
}

/**
 * The targets whose anchors are on screen, in document order. An anchor is a
 * chip sitting inline in the prose, so being in view at all is what counts —
 * there is no partially-arrived chip to have a policy about.
 */
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

/** Scroll a target's anchor to the read line, for a jump that travels. */
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
    top: container.scrollTop + offset - container.clientHeight * READ_LINE,
  });
}

export interface ActiveTarget {
  /** The target the panel should be showing. */
  activeKey: string | undefined;
  /**
   * Show a target without moving the prose — a chip or a callout, clicked from
   * wherever the reader already is.
   */
  pinTarget: (key: string) => void;
  /**
   * Travel to a target: the panel shows it and the prose scrolls to meet it, for
   * the steps that walk the tour rather than glance aside from it. The anchors
   * the scroll passes are not allowed to answer for it — the reader asked for a
   * particular target, so nothing on the way there is what they meant.
   */
  jumpToTarget: (key: string) => void;
}

/**
 * Track the active target inside a scrolling prose container. `resetKey`
 * re-observes when the rendered tour changes — switching walkthroughs replaces
 * every anchor, so the previous reading no longer refers to anything.
 */
export function useActiveTarget(
  containerRef: RefObject<HTMLElement | null>,
  resetKey: string
): ActiveTarget {
  const [activeKey, setActiveKey] = useState<string>();

  // Held as refs because the measuring outlives the render that set it up:
  // `arrive` is how a jump tells the measuring to keep quiet until it lands.
  const arriving = useRef(false);
  const arrive = useRef<(() => void) | null>(null);

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

    /* A jump's own scroll sweeps anchors into view the whole way, so what comes
       into view is tracked but left unanswered until it stops. `scrollend` is the
       real signal; the timer covers the browsers that don't fire it and the jump
       that turns out to have nowhere to travel. */
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

      // Whichever arrival lies furthest along the way the reader is going is the
      // one they have reached; the rest are behind them. A scroll fast enough to
      // bring several into view at once still lands on the right one.
      //
      // The tour opening is neither direction: the whole first screen arrives at
      // once, and the reader is at the top of it.
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

      if (container !== null) {
        arrive.current?.();
        scrollTargetIntoRead(container, key);
      }
    },
    [containerRef]
  );

  return { activeKey, jumpToTarget, pinTarget };
}
