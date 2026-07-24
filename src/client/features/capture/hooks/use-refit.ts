import { useEffect, useRef } from "react";

import type { Zoom } from "./use-zoom";

/**
 * Give the capture back whole whenever the panel asks again. The first count is
 * the one this capture mounted with — a capture arriving is already fitted, and
 * refitting it there would fight the framing a focus request is about to do.
 */
export function useRefit(zoom: Zoom, refitted: number) {
  const { refit } = zoom;
  const asked = useRef(refitted);

  useEffect(() => {
    if (refitted === asked.current) {
      return;
    }

    asked.current = refitted;
    refit();
  }, [refit, refitted]);
}
