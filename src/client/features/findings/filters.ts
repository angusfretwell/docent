/**
 * The Findings panel's filter state and matching rule. Persisted rather than
 * ephemeral (unlike the Diff's file filters) because it subsumes the standing
 * show-resolved preference it replaced: a reader who has put resolved threads
 * away expects them to stay away across a reload.
 *
 * Semantics for both groups: none checked = show all, OR within the group, and
 * the two groups AND together.
 */

import type { Status } from "@shared/lib/finding";
import { atomWithStorage } from "jotai/utils";

/** Where a Finding is read — the surface its anchor puts it on. */
export const FINDING_SURFACES = ["diff", "code", "product"] as const;

export type FindingSurface = (typeof FINDING_SURFACES)[number];

export const SURFACE_LABEL: Record<FindingSurface, string> = {
  code: "Code",
  diff: "Diff",
  product: "Product",
};

export interface FindingFilters {
  /** Statuses to show; empty shows every status. */
  statuses: readonly Status[];
  /** Surfaces to show; empty shows every surface. */
  surfaces: readonly FindingSurface[];
}

/**
 * Resolved threads stay out of the way until they are asked for, which is how
 * the panel has always opened.
 */
export const DEFAULT_FILTERS: FindingFilters = {
  statuses: ["open", "actioned"],
  surfaces: [],
};

export const findingFiltersAtom = atomWithStorage<FindingFilters>(
  "findingFilters",
  DEFAULT_FILTERS
);

function toggled<Value>(values: readonly Value[], value: Value): Value[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

export function toggleStatus(
  filters: FindingFilters,
  status: Status
): FindingFilters {
  return { ...filters, statuses: toggled(filters.statuses, status) };
}

export function toggleSurface(
  filters: FindingFilters,
  surface: FindingSurface
): FindingFilters {
  return { ...filters, surfaces: toggled(filters.surfaces, surface) };
}

/** Whether the panel is showing what it shows when nobody has touched it. */
export function isDefaultFilters(filters: FindingFilters): boolean {
  return (
    filters.surfaces.length === 0 &&
    filters.statuses.length === DEFAULT_FILTERS.statuses.length &&
    DEFAULT_FILTERS.statuses.every((status) =>
      filters.statuses.includes(status)
    )
  );
}

/**
 * A Finding with no surface — a detached anchor, or one on a kind of anchor no
 * pillar renders — is not on any of the surfaces a filter can name, so naming
 * any of them excludes it.
 */
export function matchesFindingFilters(
  filters: FindingFilters,
  finding: { status: Status; surface?: FindingSurface }
): boolean {
  if (
    filters.statuses.length > 0 &&
    !filters.statuses.includes(finding.status)
  ) {
    return false;
  }

  if (filters.surfaces.length === 0) {
    return true;
  }

  return (
    finding.surface !== undefined && filters.surfaces.includes(finding.surface)
  );
}
