/**
 * The Diff tab's deep link, URL-backed: a walkthrough range or a Findings-panel
 * row (the panel is global, so the click can come from any tab) writes
 * `tab=diff&file=…&line=…&side=…` as one history entry, and the effect scrolls
 * once `DiffView`'s imperative handle is live. The target persists in the URL —
 * that is what makes a deep link shareable — so the hook tracks the last jump
 * it actually performed: landing directly on a deep-link URL scrolls once after
 * the data loads, Back/Forward re-scroll when they change the target, and
 * `openInDiff` forces a repeat of the same target even though the URL wouldn't
 * change.
 */

import type { OpenInDiff } from "@client/lib/nav";
import { useDiffJumpParams } from "@client/url/params";
import { useEffect, useRef, useState } from "react";

import type { DiffViewHandle } from "./diff-view";

/**
 * @param diffRef The mounted `DiffView`'s imperative handle, or null before it mounts.
 * @param onFileOrder Set the walkthrough-order override for the Diff tab's file sequence.
 */
export function useDiffDeepLink(params: {
  diffRef: React.RefObject<DiffViewHandle | null>;
  onFileOrder: (order: readonly string[]) => void;
}): OpenInDiff {
  const { diffRef, onFileOrder } = params;
  const [{ tab, file, line, side }, setJump] = useDiffJumpParams();

  const performedRef = useRef<string | null>(null);
  const [repeatNonce, setRepeatNonce] = useState(0);

  function openInDiff(
    targetFile: string,
    targetLine: number,
    targetSide: "base" | "head",
    order?: readonly string[]
  ) {
    if (order) {
      onFileOrder(order);
    }

    // Forget the performed jump and bump the nonce so the effect re-scrolls
    // even when the target matches the URL (which the setter would then leave
    // untouched).
    performedRef.current = null;
    setRepeatNonce((nonce) => nonce + 1);
    void setJump({
      file: targetFile,
      line: targetLine,
      side: targetSide,
      tab: "diff",
    });
  }

  useEffect(() => {
    if (tab !== "diff" || file === null || line === null) {
      return;
    }

    const targetFile = file;
    const targetLine = line;
    const targetKey = `${targetFile}:${targetLine}:${side}`;
    if (performedRef.current === targetKey) {
      return;
    }

    // The handle mounts only once the diff data has loaded, so retry a frame at
    // a time until it exists — landing directly on a deep-link URL scrolls as
    // soon as the diff renders.
    let frame = 0;

    function attempt() {
      const handle = diffRef.current;
      if (handle === null) {
        frame = requestAnimationFrame(attempt);
        return;
      }

      handle.scrollToLine(targetFile, targetLine, side);
      performedRef.current = targetKey;
    }

    frame = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- diffRef is a stable ref object; .current is read fresh inside each frame
  }, [tab, file, line, side, repeatNonce]);

  return openInDiff;
}
