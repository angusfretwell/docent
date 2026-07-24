import { CommentWrite } from "@shared/schemas/comment-write";
import { Effect } from "effect";

import { writeCommentRecord } from "../core/comments-write";
import { resolveAuthor } from "../core/git";
import { postWriteRoute, readChangeScope } from "./api-route";

export function commentsRoute(cwd: string) {
  return postWriteRoute("/api/comments", CommentWrite, (write) =>
    Effect.gen(function* postComment() {
      const scope = yield* readChangeScope(cwd);
      const author = yield* resolveAuthor(scope.root);
      return yield* writeCommentRecord({ ...scope, author, write });
    })
  );
}
