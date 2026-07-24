/**
 * A standing, navigation-surviving request to scroll one target into view. The
 * `token` distinguishes repeat requests for the same target, so asking for one
 * already shown scrolls to it again rather than being a no-op.
 */

import type { PrimitiveAtom } from "jotai";
import { atom } from "jotai";
import { useSetAtom } from "jotai/react";
import { useCallback } from "react";

export type RevealRequest<Field extends string> = Record<Field, string> & {
  token: number;
};

export function nextReveal<Field extends string>(
  field: Field,
  value: string,
  previous: RevealRequest<Field> | null
): RevealRequest<Field> {
  return {
    ...({ [field]: value } as Record<Field, string>),
    token: (previous?.token ?? 0) + 1,
  };
}

export interface RevealTarget<Field extends string> {
  targetAtom: PrimitiveAtom<RevealRequest<Field> | null>;
  useReveal: () => (value: string) => void;
}

export function createRevealTarget<Field extends string>(
  field: Field
): RevealTarget<Field> {
  const targetAtom = atom<RevealRequest<Field> | null>(null);

  function useReveal() {
    const setTarget = useSetAtom(targetAtom);

    return useCallback(
      (value: string) => {
        setTarget((previous) => nextReveal(field, value, previous));
      },
      [setTarget]
    );
  }

  return { targetAtom, useReveal };
}
