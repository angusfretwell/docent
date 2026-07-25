/** A write is one append-only record drop; the request never carries attribution — the server stamps the author from git config. */

import { Schema } from "effect";

import { Anchor } from "./comment";
import { ChangeId, CommentId } from "./ids";

const OpenWrite = Schema.Struct({
  anchor: Anchor,
  body: Schema.String,
  op: Schema.Literal("open"),
});

const ReplyWrite = Schema.Struct({
  body: Schema.String,
  commentId: CommentId,
  op: Schema.Literal("reply"),
});

const ActionWrite = Schema.Struct({
  commentId: CommentId,
  op: Schema.Literal("action"),
});

const ResolveWrite = Schema.Struct({
  commentId: CommentId,
  op: Schema.Literal("resolve"),
});

const ReopenWrite = Schema.Struct({
  commentId: CommentId,
  op: Schema.Literal("reopen"),
});

export const CommentWrite = Schema.Union([
  OpenWrite,
  ReplyWrite,
  ActionWrite,
  ResolveWrite,
  ReopenWrite,
]);
export type CommentWrite = typeof CommentWrite.Type;

/** `changeId` is minted or idempotently reused for the live head. */
export const CommentWriteResult = Schema.Struct({
  changeId: ChangeId,
  commentId: CommentId,
  record: Schema.String,
});
export type CommentWriteResult = typeof CommentWriteResult.Type;

export const CommentWriteError = Schema.Struct({ error: Schema.String });
