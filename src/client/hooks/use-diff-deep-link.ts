/**
 * The Diff tab's deep-link one-shot, factored out of `app.tsx`: a walkthrough
 * range or a Findings-panel row (the panel is global, so the click can come
 * from any tab) opens the Diff tab at its file/line. Activating switches to
 * Diff; the effect then scrolls once `DiffView`'s imperative handle is live,
 * given a frame for the renderer to lay out, and clears the one-shot request.
 * When Diff is already active the activate call is a no-op and the same effect
 * still scrolls.
 */

import { useEffect, useState } from "react";

import type { DiffViewHandle } from "../components/diff-view";
import type { OpenInDiff } from "../components/walkthrough-view";

/**
 * @param active Whether the Diff tab is the one currently showing.
 * @param diffRef The mounted `DiffView`'s imperative handle, or null before it mounts.
 * @param onActivate Switch the surrounding tab set to Diff.
 * @param onFileOrder Set the walkthrough-order override for the Diff tab's file sequence.
 */
export function useDiffDeepLink(params: {
  active: boolean;
  diffRef: React.RefObject<DiffViewHandle | null>;
  onActivate: () => void;
  onFileOrder: (order: readonly string[]) => void;
}): OpenInDiff {
  const { active, diffRef, onActivate, onFileOrder } = params;
  const [pendingJump, setPendingJump] = useState<{
    file: string;
    line: number;
    side: "base" | "head";
  } | null>(null);

  function openInDiff(
    file: string,
    line: number,
    side: "base" | "head",
    order?: readonly string[]
  ) {
    onActivate();
    setPendingJump({ file, line, side });
    if (order) {
      onFileOrder(order);
    }
  }

  useEffect(() => {
    if (!active || pendingJump === null) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      diffRef.current?.scrollToLine(
        pendingJump.file,
        pendingJump.line,
        pendingJump.side
      );
      setPendingJump(null);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- diffRef is a stable ref object; .current is read fresh inside the frame
  }, [active, pendingJump]);

  return openInDiff;
}
