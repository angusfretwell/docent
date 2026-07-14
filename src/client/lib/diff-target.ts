import { atom } from "jotai";
import { useSetAtom } from "jotai/react";
import { useCallback } from "react";

/**
 * A scroll request, not selection state: `token` distinguishes two requests for
 * the same item so re-selecting a file scrolls to it again.
 */
interface DiffTarget {
  id: string;
  token: number;
}

export const diffTargetAtom = atom<DiffTarget | null>(null);

/**
 * Reveals a diff item in the code view. Survives navigation to `/`, so the
 * Findings panel can target the diff from any route.
 */
export function useRevealDiffItem() {
  const setTarget = useSetAtom(diffTargetAtom);

  return useCallback(
    (id: string) => {
      setTarget((prev) => ({ id, token: (prev?.token ?? 0) + 1 }));
    },
    [setTarget]
  );
}
