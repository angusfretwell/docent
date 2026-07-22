/**
 * A reveal channel: a standing request to bring one target into view, raised
 * from anywhere and answered wherever the surface that owns the target mounts.
 *
 * The request is a scroll intent, not selection state — its `token` distinguishes
 * two requests for the same target, so asking for a target already shown scrolls
 * to it again rather than being a no-op. The target's identity rides on a
 * caller-named field (`id` for a diff item, `key` for a walkthrough section) so
 * each consumer reads it back under the name it already expects.
 */

import type { PrimitiveAtom } from "jotai";
import { atom } from "jotai";
import { useSetAtom } from "jotai/react";
import { useCallback } from "react";

/** A standing reveal request: the target's identity on `field`, plus a `token`. */
export type RevealRequest<Field extends string> = Record<Field, string> & {
  token: number;
};

/**
 * The next request for `value`, its `token` bumped past `previous` so a repeat
 * request is distinct from the one before it and re-triggers the same answer.
 */
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

/** An atom holding a target's standing reveal request, and the hook that raises one. */
export interface RevealTarget<Field extends string> {
  targetAtom: PrimitiveAtom<RevealRequest<Field> | null>;
  useReveal: () => (value: string) => void;
}

/**
 * Build a reveal channel keyed by `field`. Returns the atom the request lives on
 * and a hook whose call raises one. The request survives navigation — set on one
 * route, answered when the addressed surface next reads the atom.
 */
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
