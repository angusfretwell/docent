import { ANCHOR_KIND } from "@shared/enums/anchor-kind";
import type { FoldedComment } from "@shared/lib/comment";
import { compareDesc, parseISO } from "date-fns";

import type { CommentSurface } from "./filters";

interface Orderable {
  comment: FoldedComment;
  surface?: CommentSurface;
}

function rank(entry: Orderable, surface: CommentSurface | undefined): number {
  if (entry.comment.anchor?.kind === ANCHOR_KIND.change) {
    return 0;
  }

  return entry.surface !== undefined && entry.surface === surface ? 1 : 2;
}

function byOpenedAt(left: FoldedComment, right: FoldedComment): number {
  if (left.openedAt === undefined) {
    return right.openedAt === undefined ? 0 : 1;
  }

  if (right.openedAt === undefined) {
    return -1;
  }

  return compareDesc(parseISO(left.openedAt), parseISO(right.openedAt));
}

/**
 * Reading order for the Comments panel: what is about the whole change, then
 * what is about the surface in front of the reader, then everywhere else —
 * newest first within each. Sorted on `openedAt` so a reply on an old thread
 * doesn't drag it back to the top.
 */
export function orderComments<T extends Orderable>(
  entries: readonly T[],
  surface?: CommentSurface
): T[] {
  return entries.toSorted(
    (left, right) =>
      rank(left, surface) - rank(right, surface) ||
      byOpenedAt(left.comment, right.comment)
  );
}
