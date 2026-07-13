/**
 * The visible code window for one walkthrough range (walkthroughs.md §1):
 * reads the range's content-addressed born blob from the immutable blob query
 * (one fetch per sha, shared across ranges), then re-slices it to the range's
 * lines widened by `context` — a pure re-slice of bytes already in hand, never
 * a second fetch, so "Expand context" costs nothing but a render. `codeWindow`
 * is `null` while the blob is in flight; `failed` reports a load failure.
 */

import { blobTextQuery } from "@client/data/blobs";
import type { WalkthroughRange } from "@shared/schemas/walkthrough";
import { useQuery } from "@tanstack/react-query";

import { rangeWindow } from "./walkthrough-context";
import type { RangeWindow } from "./walkthrough-context";

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
  const blob = useQuery(blobTextQuery(range.blobSha));

  const codeWindow =
    blob.data === undefined
      ? null
      : rangeWindow(blob.data, range.lines, context);

  return { codeWindow, failed: blob.isError };
}
