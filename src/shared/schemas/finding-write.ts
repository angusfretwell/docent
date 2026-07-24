/** A write is one append-only record drop; the request never carries attribution — the server stamps the author from git config. */

import { Schema } from "effect";

import { Anchor } from "./finding";
import { ChangeId, FindingId } from "./ids";

const OpenWrite = Schema.Struct({
  anchor: Anchor,
  body: Schema.String,
  op: Schema.Literal("open"),
});

const ReplyWrite = Schema.Struct({
  body: Schema.String,
  findingId: FindingId,
  op: Schema.Literal("reply"),
});

const ActionWrite = Schema.Struct({
  findingId: FindingId,
  op: Schema.Literal("action"),
});

const ResolveWrite = Schema.Struct({
  findingId: FindingId,
  op: Schema.Literal("resolve"),
});

const ReopenWrite = Schema.Struct({
  findingId: FindingId,
  op: Schema.Literal("reopen"),
});

const EditWrite = Schema.Struct({
  body: Schema.String,
  /** Filename of the superseded record (e.g. `002-reply.md`), not a record id — hence a plain string. */
  edits: Schema.String,
  findingId: FindingId,
  op: Schema.Literal("edit"),
});

export const FindingWrite = Schema.Union([
  OpenWrite,
  ReplyWrite,
  ActionWrite,
  ResolveWrite,
  ReopenWrite,
  EditWrite,
]);
export type FindingWrite = typeof FindingWrite.Type;

/** `changeId` is minted or idempotently reused for the live head. */
export const FindingWriteResult = Schema.Struct({
  changeId: ChangeId,
  findingId: FindingId,
  record: Schema.String,
});
export type FindingWriteResult = typeof FindingWriteResult.Type;

export const FindingWriteError = Schema.Struct({ error: Schema.String });
