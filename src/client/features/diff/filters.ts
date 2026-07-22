/**
 * The Diff view's file-filter state and matching rule. Deliberately ephemeral —
 * a plain jotai atom, no storage — so filters reset on reload. Semantics:
 * git-status group none-checked = show all, OR within the group; the Unviewed
 * and Findings toggles each AND on top.
 */

import type { GitStatus } from "@pierre/trees";
import { atom } from "jotai";

export interface DiffFilters {
  /** Show only files a Finding is anchored to. */
  findings: boolean;
  /** Git statuses to show; empty shows all. */
  statuses: ReadonlySet<GitStatus>;
  /** Show only files not yet marked viewed. */
  unviewed: boolean;
}

export const EMPTY_FILTERS: DiffFilters = {
  findings: false,
  statuses: new Set(),
  unviewed: false,
};

export const diffFiltersAtom = atom<DiffFilters>(EMPTY_FILTERS);

/** Toggle one status inside the git-status group. */
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
  file: { hasFinding: boolean; status: GitStatus; viewed: boolean }
): boolean {
  if (filters.statuses.size > 0 && !filters.statuses.has(file.status)) {
    return false;
  }
  if (filters.unviewed && file.viewed) {
    return false;
  }
  if (filters.findings && !file.hasFinding) {
    return false;
  }

  return true;
}
