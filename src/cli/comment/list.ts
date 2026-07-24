import { resolveRepo } from "@core/git";
import { readReviewSnapshot } from "@core/review";
import type { CommentStatus } from "@shared/enums/comment-status";
import { foldComment, sortFoldedComments } from "@shared/lib/comment";
import type { FoldedComment } from "@shared/lib/comment";
import { Effect } from "effect";

export interface CommentFilter {
  status: readonly CommentStatus[];
  anchorFile?: string;
  author?: string;
}

function anchorFileOf(comment: FoldedComment): string | undefined {
  const { anchor } = comment;
  if (anchor?.kind === "line" || anchor?.kind === "file") {
    return anchor.file;
  }
  return undefined;
}

export function applyCommentFilter(
  comments: readonly FoldedComment[],
  filter: CommentFilter
): FoldedComment[] {
  const status = new Set(filter.status);
  return comments.filter((comment) => {
    if (status.size > 0 && !status.has(comment.status)) {
      return false;
    }
    if (
      filter.anchorFile !== undefined &&
      anchorFileOf(comment) !== filter.anchorFile
    ) {
      return false;
    }
    if (
      filter.author !== undefined &&
      !comment.participants.some(
        (participant) => participant.id === filter.author
      )
    ) {
      return false;
    }
    return true;
  });
}

export const listComments = Effect.fn("listComments")(function* listComments(
  cwd: string,
  filter: CommentFilter
) {
  const repo = yield* resolveRepo(cwd);
  const snapshot = yield* readReviewSnapshot({
    base: repo.defaultBranch.name,
    branch: repo.branch,
    root: repo.root,
  });
  const folded = snapshot.comments.map((entry) =>
    foldComment(entry.id, entry.records)
  );
  return sortFoldedComments(applyCommentFilter(folded, filter));
});
