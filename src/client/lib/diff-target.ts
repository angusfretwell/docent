import { createRevealTarget } from "@client/lib/reveal-target";

const diffReveal = createRevealTarget("id");

/**
 * A scroll request, not selection state: re-selecting a diff item scrolls to it
 * again. Survives navigation to `/`, so the Findings panel can target the diff
 * from any route.
 */
export const diffTargetAtom = diffReveal.targetAtom;

/** Reveals a diff item in the code view. */
export const useRevealDiffItem = diffReveal.useReveal;
