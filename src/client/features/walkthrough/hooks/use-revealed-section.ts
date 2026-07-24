import { sectionKey } from "@client/lib/finding-sections";
import { createRevealTarget } from "@client/lib/reveal-target";
import type { SectionId, WalkthroughId } from "@shared/schemas/ids";
import { useAtomValue } from "jotai/react";
import type { RefObject } from "react";
import { useEffect } from "react";

const HEADROOM_PX = 24;

const SECTION_ATTRIBUTE = "data-walkthrough-section";

const sectionReveal = createRevealTarget("key");

/** A standing reveal request, settable from any route and answered by `useRevealedSection` when the addressed tour mounts. */
export const walkthroughTargetAtom = sectionReveal.targetAtom;

export const useRevealSection = sectionReveal.useReveal;

export function sectionAnchorProps(
  walkthroughId: WalkthroughId,
  sectionId: SectionId
) {
  return { [SECTION_ATTRIBUTE]: sectionKey(walkthroughId, sectionId) };
}

/**
 * Both pillars run this hook; a request names one section of one walkthrough, so
 * only the addressee moves. The active target is left to settle on its own —
 * bringing a section into view brings its chips with it.
 */
export function useRevealedSection(
  containerRef: RefObject<HTMLElement | null>,
  walkthroughId: WalkthroughId
): void {
  const target = useAtomValue(walkthroughTargetAtom);
  const token = target?.token;
  const key = target?.key;

  useEffect(() => {
    const container = containerRef.current;

    if (container === null || key === undefined) {
      return;
    }

    if (!key.startsWith(`${walkthroughId}/`)) {
      return;
    }

    const section = container.querySelector(`[${SECTION_ATTRIBUTE}="${key}"]`);

    if (section === null) {
      return;
    }

    const offset =
      section.getBoundingClientRect().top -
      container.getBoundingClientRect().top;

    container.scrollTo({
      behavior: "smooth",
      top: container.scrollTop + offset - HEADROOM_PX,
    });
  }, [containerRef, key, token, walkthroughId]);
}
