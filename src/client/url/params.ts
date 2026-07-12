/**
 * The URL-backed view-state schema: every query param the SPA reads or writes,
 * declared once so components share one source of truth. Defaults keep the URL
 * clean (nuqs clears a param that equals its default), and history mode is set
 * globally to `push` on the adapter in `main.tsx`, so Back/Forward walk view
 * state.
 */

import type { PendingRange } from "@shared/schemas/pending";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";

// The tab / view mode (walkthroughs.md §1). Each is its own self-contained
// surface over the same Change: the Diff tab, the Code walkthrough tab, and the
// Product walkthrough tab (#15).
const TABS = ["diff", "walkthrough", "product"] as const;
export type Tab = (typeof TABS)[number];

// Which selector entry is showing: the committed Change, or the read-only
// Pending working-tree preview.
const VIEWS = ["change", "pending"] as const;
export type Selection = (typeof VIEWS)[number];

const RANGES = [
  "incremental",
  "cumulative",
] as const satisfies readonly PendingRange[];

const SIDES = ["base", "head"] as const;

const tabParser = parseAsStringLiteral(TABS).withDefault("diff");

export function useTabParam() {
  return useQueryState("tab", tabParser);
}

export function useViewParam() {
  return useQueryState(
    "view",
    parseAsStringLiteral(VIEWS).withDefault("change")
  );
}

export function useRangeParam() {
  return useQueryState(
    "range",
    parseAsStringLiteral(RANGES).withDefault("incremental")
  );
}

/** The expanded Finding thread in the global Findings panel. */
export function useFindingParam() {
  return useQueryState("finding", parseAsString);
}

/** The Findings panel's show-resolved toggle. */
export function useResolvedParam() {
  return useQueryState("resolved", parseAsBoolean.withDefault(false));
}

/**
 * The diff deep-link target, bundled with the tab so a jump activates the Diff
 * tab and sets file/line/side as one atomic update — one history entry.
 */
export function useDiffJumpParams() {
  return useQueryStates({
    file: parseAsString,
    line: parseAsInteger,
    side: parseAsStringLiteral(SIDES).withDefault("head"),
    tab: tabParser,
  });
}
