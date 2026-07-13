/**
 * The visible line window for a walkthrough code range and its inline
 * context-expansion (walkthroughs.md §1). A range renders a slice of its born
 * blob; this widens that slice by however many lines the reader has expanded on
 * each side, clamped to the blob's bounds. The full blob is already in hand —
 * one `/api/blob/:sha` fetch — so expanding is a pure re-slice, never another
 * fetch, sourcing the same content-addressed blobs the Diff tab expands from.
 * No DOM or React here: this is the pure window model the Code walkthrough tab
 * drives.
 */

import { splitLines } from "@shared/lib/drift";

/** How many context lines each expansion step reveals on each side of a range. */
export const CONTEXT_STEP = 20;

export interface RangeWindow {
  /** Whether unshown lines remain below the window. */
  canExpandDown: boolean;
  /** Whether unshown lines remain above the window. */
  canExpandUp: boolean;
  /** The 1-based inclusive `[start, end]` lines shown, clamped to the blob. */
  lines: [number, number];
  /** The blob text sliced to `lines`. */
  text: string;
}

/**
 * The window for a range widened by `context` lines on each side, clamped to the
 * blob. `canExpandUp`/`canExpandDown` report whether the clamp left any hidden
 * lines, so the caller can retire the affordance once the whole file is shown.
 */
export function rangeWindow(
  fullText: string,
  core: readonly [number, number],
  context: number
): RangeWindow {
  const lines = splitLines(fullText);
  const total = lines.length;

  const start = Math.max(1, core[0] - context);
  const end = Math.min(total, core[1] + context);

  return {
    canExpandDown: end < total,
    canExpandUp: start > 1,
    lines: [start, end],
    text: lines.slice(start - 1, end).join("\n"),
  };
}
