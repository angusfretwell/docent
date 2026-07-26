import { atom } from "jotai";
import { useAtomValue, useSetAtom } from "jotai/react";
import { useCallback, useEffect, useRef } from "react";
import { usePanelRef } from "react-resizable-panels";

/**
 * A reset is a bump, not a flag: a group only reads its stored layout when it
 * mounts, so the panels have to be resized in place rather than re-mounted —
 * re-mounting would throw away the diff the reader is sitting in.
 */
const panelResetsAtom = atom(0);

/** Sizes the panel back to `defaultSize` on every reset. */
export function useResettablePanel(defaultSize: number | string) {
  const panelRef = usePanelRef();
  const resets = useAtomValue(panelResetsAtom);
  const applied = useRef(resets);

  useEffect(() => {
    if (applied.current === resets) {
      return;
    }

    applied.current = resets;
    panelRef.current?.resize(defaultSize);
  }, [defaultSize, panelRef, resets]);

  return panelRef;
}

export function useResetPanels() {
  const bumpResets = useSetAtom(panelResetsAtom);

  return useCallback(() => {
    bumpResets((count) => count + 1);
  }, [bumpResets]);
}
