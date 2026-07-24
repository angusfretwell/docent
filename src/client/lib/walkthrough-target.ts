import { sectionKey } from "@client/lib/section-findings";
import type { SectionId, WalkthroughId } from "@shared/schemas/ids";
import { atom } from "jotai";
import { useAtomValue, useSetAtom } from "jotai/react";
import type { RefObject } from "react";
import { useCallback, useEffect } from "react";

/** How far below the top of the prose a revealed section is brought to rest. */
const HEADROOM = 24;

const SECTION_ATTRIBUTE = "data-walkthrough-section";

/**
 * A scroll request, not selection state: `token` distinguishes two requests for
 * the same section so asking again scrolls to it again.
 */
interface WalkthroughTarget {
  key: string;
  token: number;
}

export const walkthroughTargetAtom = atom<WalkthroughTarget | null>(null);

/** The attribute a section carries so a reveal request can find it. */
export function sectionAnchorProps(
  walkthroughId: WalkthroughId,
  sectionId: SectionId
) {
  return { [SECTION_ATTRIBUTE]: sectionKey(walkthroughId, sectionId) };
}

/**
 * Reveals a walkthrough section in its pillar's prose. Survives the navigation
 * to `/code` or `/product`, so the Findings panel can target a tour from any
 * route — the request is set here and answered when the tour mounts.
 */
export function useRevealSection() {
  const setTarget = useSetAtom(walkthroughTargetAtom);

  return useCallback(
    (key: string) => {
      setTarget((previous) => ({ key, token: (previous?.token ?? 0) + 1 }));
    },
    [setTarget]
  );
}

/**
 * Answer a standing reveal request against this pillar's prose. A request names
 * one section of one walkthrough, so the tour that doesn't hold it leaves it
 * alone — both pillars run this hook and only the addressee moves.
 *
 * The scroll is left to settle the active target on its own: bringing a section
 * into view brings its chips with it, which is exactly how reading there would
 * have chosen the same target.
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
      top: container.scrollTop + offset - HEADROOM,
    });
  }, [containerRef, key, token, walkthroughId]);
}
