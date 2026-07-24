import { createRevealTarget } from "@client/lib/reveal-target";

const diffReveal = createRevealTarget("id");

export const diffTargetAtom = diffReveal.targetAtom;

export const useRevealDiffItem = diffReveal.useReveal;
