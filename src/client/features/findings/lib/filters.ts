/**
 * Persisted (not ephemeral like the Diff's file filters) so a reader who has
 * put resolved threads away keeps them away across a reload.
 */

import type { FindingStatus } from "@shared/enums/finding-status";
import { WALKTHROUGH_KIND_LABEL } from "@shared/enums/walkthrough-kind";
import { atomWithStorage } from "jotai/utils";
import { toggle } from "radashi";

export const FINDING_SURFACES = ["diff", "code", "product"] as const;

export type FindingSurface = (typeof FINDING_SURFACES)[number];

export const SURFACE_LABEL: Record<FindingSurface, string> = {
  diff: "Diff",
  ...WALKTHROUGH_KIND_LABEL,
};

export interface FindingFilters {
  /** Empty shows every status. */
  statuses: readonly FindingStatus[];
  /** Empty shows every surface. */
  surfaces: readonly FindingSurface[];
}

export const DEFAULT_FILTERS: FindingFilters = {
  statuses: ["open", "actioned"],
  surfaces: [],
};

export const findingFiltersAtom = atomWithStorage<FindingFilters>(
  "findingFilters",
  DEFAULT_FILTERS
);

export function toggleStatus(
  filters: FindingFilters,
  status: FindingStatus
): FindingFilters {
  return { ...filters, statuses: toggle(filters.statuses, status) };
}

export function toggleSurface(
  filters: FindingFilters,
  surface: FindingSurface
): FindingFilters {
  return { ...filters, surfaces: toggle(filters.surfaces, surface) };
}

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
 * A Finding with no surface — a detached anchor, or one no pillar renders — is
 * on none of the nameable surfaces, so naming any surface excludes it.
 */
export function matchesFindingFilters(
  filters: FindingFilters,
  finding: { status: FindingStatus; surface?: FindingSurface }
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
