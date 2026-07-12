/**
 * The visible code window for one walkthrough range (walkthroughs.md §1):
 * fetches the range's content-addressed born blob (`/api/blob/:sha`) once,
 * then re-slices it to the range's lines widened by `context` — a pure
 * re-slice of bytes already in hand, never a second fetch, so "Expand
 * context" costs nothing but a render. `codeWindow` is `null` while the blob
 * is in flight; `failed` reports a load failure.
 */

import type { WalkthroughRange } from "@shared/schemas/walkthrough";
import { useEffect, useState } from "react";

import { fetchBlobText } from "../lib/blobs";
import { rangeWindow } from "../lib/walkthrough-context";
import type { RangeWindow } from "../lib/walkthrough-context";

export interface RangeWindowResult {
  /** The range's current visible window, or `null` while its blob is in flight. */
  codeWindow: RangeWindow | null;
  /** Whether the range's blob failed to load. */
  failed: boolean;
}

/** The visible window for `range`, widened by `context` lines on each side. */
export function useRangeWindow(
  range: WalkthroughRange,
  context: number
): RangeWindowResult {
  const [full, setFull] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBlobText(range.blobSha)
      .then((text) => {
        if (!cancelled) {
          setFull(text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range.blobSha]);

  const codeWindow =
    full === null ? null : rangeWindow(full, range.lines, context);

  return { codeWindow, failed };
}
