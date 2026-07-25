import type { Anchor, Author } from "@shared/schemas/comment";
import type { CommentWrite } from "@shared/schemas/comment-write";
import { CommentId } from "@shared/schemas/ids";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { makeId } from "./store/id";
import { listDir } from "./store/io";
import { recordFile, serializeFrontmatter } from "./store/records";
import type { ChangeRefs } from "./write-context";
import { maxSequence, now, resolveWriteContext } from "./write-context";

function frontmatter(fields: {
  author: Author;
  changeId: string;
  createdAt: string;
  anchor?: Anchor;
}): string {
  const author = {
    display: fields.author.display,
    id: fields.author.id,
    kind: fields.author.kind,
    ...(fields.author.model === undefined
      ? {}
      : { model: fields.author.model }),
  };
  const ordered: [string, unknown][] = [
    ["schema", "docent/comment"],
    ["author", author],
    ["changeId", fields.changeId],
    ["createdAt", fields.createdAt],
    ["anchor", fields.anchor],
  ];
  return serializeFrontmatter(ordered);
}

export const writeCommentRecord = Effect.fn("writeCommentRecord")(
  function* writeCommentRecord(params: {
    root: string;
    branch: string;
    base: string;
    refs: ChangeRefs;
    author: Author;
    write: CommentWrite;
  }) {
    const fs = yield* FileSystem;
    const path = yield* Path;

    const { change, reviewDir } = yield* resolveWriteContext({
      base: params.base,
      branch: params.branch,
      refs: params.refs,
      root: params.root,
    });
    const createdAt = yield* now;

    const commentsDir = path.join(reviewDir, "comments");
    const { write } = params;

    const commentId =
      write.op === "open" ? yield* makeId(CommentId, "cmt") : write.commentId;
    const commentDir = path.join(commentsDir, commentId);
    const existing =
      write.op === "open"
        ? []
        : (yield* listDir(commentDir)).filter((name) => name.endsWith(".md"));
    const sequence = String(maxSequence(existing, /^(?<n>\d+)-/) + 1).padStart(
      3,
      "0"
    );
    const recordName = `${sequence}-${write.op}.md`;

    const meta: Parameters<typeof frontmatter>[0] = {
      author: params.author,
      changeId: change.id,
      createdAt,
      ...(write.op === "open" ? { anchor: write.anchor } : {}),
    };
    const body = "body" in write ? write.body : "";

    yield* fs.makeDirectory(commentDir, { recursive: true });
    yield* fs.writeFileString(
      path.join(commentDir, recordName),
      recordFile(frontmatter(meta), body)
    );

    return { changeId: change.id, commentId, record: recordName };
  }
);
