import type { FoldedComment } from "@shared/lib/comment";
import { Fragment } from "react";

import { CommentActions } from "./actions";
import { Comment } from "./comment";

export function CommentThread({ comment }: { comment: FoldedComment }) {
  return (
    <div className="grid gap-4">
      <Comment
        author={comment.openedBy}
        body={comment.body}
        createdAt={comment.openedAt}
      />

      {comment.replies.length > 0 && (
        <div className="ml-1 grid gap-4 border-l pl-3">
          {comment.replies.map((reply) => (
            <Fragment key={`${reply.createdAt}:${reply.author.id}`}>
              <Comment
                author={reply.author}
                body={reply.body}
                createdAt={reply.createdAt}
              />
            </Fragment>
          ))}
        </div>
      )}

      <CommentActions comment={comment} />
    </div>
  );
}
