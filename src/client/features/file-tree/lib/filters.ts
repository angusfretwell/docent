import type { GitStatus } from "@pierre/trees";
import { atom } from "jotai";

export interface DiffFilters {
  comments: boolean;
  /** Empty shows all. */
  statuses: ReadonlySet<GitStatus>;
  unviewed: boolean;
}

export const EMPTY_FILTERS: DiffFilters = {
  comments: false,
  statuses: new Set(),
  unviewed: false,
};

export const diffFiltersAtom = atom<DiffFilters>(EMPTY_FILTERS);

export function toggleStatusFilter(
  filters: DiffFilters,
  status: GitStatus
): DiffFilters {
  const statuses = new Set(filters.statuses);

  if (!statuses.delete(status)) {
    statuses.add(status);
  }

  return { ...filters, statuses };
}

export function matchesFilters(
  filters: DiffFilters,
  file: { hasComment: boolean; status: GitStatus; viewed: boolean }
): boolean {
  if (filters.statuses.size > 0 && !filters.statuses.has(file.status)) {
    return false;
  }
  if (filters.unviewed && file.viewed) {
    return false;
  }
  if (filters.comments && !file.hasComment) {
    return false;
  }

  return true;
}
