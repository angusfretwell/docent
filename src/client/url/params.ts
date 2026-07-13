/**
 * The URL-backed view-state schema: every search param the SPA reads or writes,
 * declared once so the routes and components share one source of truth. The
 * validators feed each route's `validateSearch` (malformed values fall back to
 * their defaults rather than erroring), and the `*_SEARCH_DEFAULTS` objects
 * feed `stripSearchParams` so a param at its default stays out of the URL.
 */

import type { PendingRange } from "@shared/schemas/pending";
import type { SearchSchemaInput } from "@tanstack/react-router";
import { useNavigate, useSearch } from "@tanstack/react-router";

/**
 * Which selector entry is showing: the committed Change, or the read-only
 * Pending working-tree preview.
 */
const VIEWS = ["change", "pending"] as const;
export type Selection = (typeof VIEWS)[number];

const RANGES = [
  "incremental",
  "cumulative",
] as const satisfies readonly PendingRange[];

const SIDES = ["base", "head"] as const;
export type DiffSide = (typeof SIDES)[number];

/** Review-global params, validated on the root route so every view sees them. */
export interface RootSearch {
  /** The expanded Finding thread in the global Findings panel. */
  finding?: string;
  /** The Findings panel's show-resolved toggle. */
  resolved: boolean;
}

/** The Diff view's params: the selector state plus the deep-link target. */
export interface DiffSearch {
  view: Selection;
  range: PendingRange;
  file?: string;
  line?: number;
  side: DiffSide;
}

export const ROOT_SEARCH_DEFAULTS = { resolved: false };

export const DIFF_SEARCH_DEFAULTS = {
  range: "incremental",
  side: "head",
  view: "change",
} as const;

/** The value when it is one of the allowed literals, else the fallback. */
function literalOr<T extends string>(
  options: readonly T[],
  value: unknown,
  fallback: T
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/**
 * The `SearchSchemaInput` intersection types navigation writes as the partial
 * input (every param optional, defaults filled by the validator) while reads
 * see the full output. The URL itself can still carry arbitrary junk, so the
 * bodies validate defensively regardless of the declared parameter type.
 */
export function validateRootSearch(
  search: Partial<RootSearch> & SearchSchemaInput
): RootSearch {
  return {
    ...(typeof search.finding === "string" ? { finding: search.finding } : {}),
    resolved: search.resolved === true,
  };
}

export function validateDiffSearch(
  search: Partial<DiffSearch> & SearchSchemaInput
): DiffSearch {
  return {
    ...(typeof search.file === "string" ? { file: search.file } : {}),
    ...(typeof search.line === "number" && Number.isInteger(search.line)
      ? { line: search.line }
      : {}),
    range: literalOr(RANGES, search.range, DIFF_SEARCH_DEFAULTS.range),
    side: literalOr(SIDES, search.side, DIFF_SEARCH_DEFAULTS.side),
    view: literalOr(VIEWS, search.view, DIFF_SEARCH_DEFAULTS.view),
  };
}

export function useViewParam() {
  const view = useSearch({ from: "/diff", select: (search) => search.view });
  const navigate = useNavigate({ from: "/diff" });

  function setView(next: Selection) {
    void navigate({ search: (prev) => ({ ...prev, view: next }) });
  }

  return [view, setView] as const;
}

export function useRangeParam() {
  const range = useSearch({ from: "/diff", select: (search) => search.range });
  const navigate = useNavigate({ from: "/diff" });

  function setRange(next: PendingRange) {
    void navigate({ search: (prev) => ({ ...prev, range: next }) });
  }

  return [range, setRange] as const;
}

/** The expanded Finding thread — root-level, writable from any view. */
export function useFindingParam() {
  const finding = useSearch({
    select: (search) => search.finding ?? null,
    strict: false,
  });
  const navigate = useNavigate();

  function setFinding(next: string | null) {
    void navigate({
      search: (prev) => ({ ...prev, finding: next ?? undefined }),
      to: ".",
    });
  }

  return [finding, setFinding] as const;
}

/** The Findings panel's show-resolved toggle — root-level, like `finding`. */
export function useResolvedParam() {
  const resolved = useSearch({
    select: (search) => search.resolved ?? false,
    strict: false,
  });
  const navigate = useNavigate();

  function setResolved(next: boolean) {
    void navigate({
      search: (prev) => ({ ...prev, resolved: next }),
      to: ".",
    });
  }

  return [resolved, setResolved] as const;
}
