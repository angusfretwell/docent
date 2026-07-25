/**
 * Persisted (not ephemeral like the Diff's file filters) so a reader who has
 * put resolved threads away keeps them away across a reload.
 */

import type { CommentStatus } from "@shared/enums/comment-status";
import { WALKTHROUGH_KIND_LABEL } from "@shared/enums/walkthrough-kind";
import { atomWithStorage } from "jotai/utils";
import { toggle } from "radashi";

export const COMMENT_SURFACES = ["diff", "code", "product"] as const;

export type CommentSurface = (typeof COMMENT_SURFACES)[number];

export const SURFACE_LABEL: Record<CommentSurface, string> = {
  diff: "Diff",
  ...WALKTHROUGH_KIND_LABEL,
};

export interface CommentFilters {
  /** Empty shows every status. */
  statuses: readonly CommentStatus[];
  /** Empty shows every surface. */
  surfaces: readonly CommentSurface[];
}

export const DEFAULT_FILTERS: CommentFilters = {
  statuses: ["open", "actioned"],
  surfaces: [],
};

export const commentFiltersAtom = atomWithStorage<CommentFilters>(
  "commentFilters",
  DEFAULT_FILTERS
);

export function toggleStatus(
  filters: CommentFilters,
  status: CommentStatus
): CommentFilters {
  return { ...filters, statuses: toggle(filters.statuses, status) };
}

export function toggleSurface(
  filters: CommentFilters,
  surface: CommentSurface
): CommentFilters {
  return { ...filters, surfaces: toggle(filters.surfaces, surface) };
}

export function isDefaultFilters(filters: CommentFilters): boolean {
  return (
    filters.surfaces.length === 0 &&
    filters.statuses.length === DEFAULT_FILTERS.statuses.length &&
    DEFAULT_FILTERS.statuses.every((status) =>
      filters.statuses.includes(status)
    )
  );
}

/**
 * A Comment with no surface — a detached anchor, or one no pillar renders — is
 * on none of the nameable surfaces, so naming any surface excludes it.
 */
export function matchesCommentFilters(
  filters: CommentFilters,
  comment: { status: CommentStatus; surface?: CommentSurface }
): boolean {
  if (
    filters.statuses.length > 0 &&
    !filters.statuses.includes(comment.status)
  ) {
    return false;
  }

  if (filters.surfaces.length === 0) {
    return true;
  }

  return (
    comment.surface !== undefined && filters.surfaces.includes(comment.surface)
  );
}
