/**
 * A standing, navigation-surviving request to scroll one target into view. The
 * `token` distinguishes repeat requests for the same target, so asking for one
 * already shown scrolls to it again rather than being a no-op.
 */

import type { PrimitiveAtom } from "jotai";
import { atom } from "jotai";
import { useSetAtom } from "jotai/react";
import { useCallback } from "react";

export type RevealRequest<Target extends object> = Target & { token: number };

export function nextReveal<Target extends object>(
  target: Target,
  previous: RevealRequest<Target> | null
): RevealRequest<Target> {
  return { ...target, token: (previous?.token ?? 0) + 1 };
}

export interface RevealTarget<Target extends object> {
  targetAtom: PrimitiveAtom<RevealRequest<Target> | null>;
  useReveal: () => (target: Target) => void;
}

export function createRevealTarget<
  Target extends object,
>(): RevealTarget<Target> {
  const targetAtom = atom<RevealRequest<Target> | null>(null);

  function useReveal() {
    const setTarget = useSetAtom(targetAtom);

    return useCallback(
      (target: Target) => {
        setTarget((previous) => nextReveal(target, previous));
      },
      [setTarget]
    );
  }

  return { targetAtom, useReveal };
}
