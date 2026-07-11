/**
 * The `POST /api/findings` request and response shapes, shared by the browser
 * client (producer) and the Bun server (consumer). Runtime-neutral: no Bun or
 * DOM globals here.
 *
 * A write is one append-only record drop — a new Finding (`open`), a `reply`
 * (with optional disposition), a `resolve`, a `reopen`, or an `edit` (which
 * supersedes an earlier record's body) — the identical shape an agent writes
 * directly into `.docent/` (data-model.md §5, §7; architecture.md §2). The
 * request never carries attribution: the UI is definitionally the human, so the
 * server stamps the author from git config.
 */

import { Schema } from "effect";

import { Anchor, Disposition } from "./finding";

/** Open a new Finding: the root record carries the content-addressed anchor. */
const OpenWrite = Schema.Struct({
  anchor: Anchor,
  body: Schema.String,
  op: Schema.Literal("open"),
});

/** Reply on an existing Finding, optionally closing the turn with a disposition. */
const ReplyWrite = Schema.Struct({
  body: Schema.String,
  disposition: Schema.optional(Disposition),
  findingId: Schema.String,
  op: Schema.Literal("reply"),
});

/** Resolve a Finding; the optional body is the resolve reason. */
const ResolveWrite = Schema.Struct({
  body: Schema.optional(Schema.String),
  findingId: Schema.String,
  op: Schema.Literal("resolve"),
});

/** Reopen a resolved Finding. */
const ReopenWrite = Schema.Struct({
  findingId: Schema.String,
  op: Schema.Literal("reopen"),
});

/**
 * Edit an earlier record's body: `edits` names the target record's filename
 * (e.g. `002-reply.md`), and `body` is the superseding text the fold applies at
 * read time (data-model.md §5.1). Append-only — the original record is never
 * rewritten.
 */
const EditWrite = Schema.Struct({
  body: Schema.String,
  edits: Schema.String,
  findingId: Schema.String,
  op: Schema.Literal("edit"),
});

/** The `POST /api/findings` request body — one append-only record to drop. */
export const FindingWrite = Schema.Union([
  OpenWrite,
  ReplyWrite,
  ResolveWrite,
  ReopenWrite,
  EditWrite,
]);
export type FindingWrite = typeof FindingWrite.Type;

/**
 * The `POST /api/findings` success body: the Finding the record landed in, the
 * record filename appended, and the Change stamped on it (minted or
 * idempotently reused for the live head).
 */
export const FindingWriteResult = Schema.Struct({
  changeId: Schema.String,
  findingId: Schema.String,
  record: Schema.String,
});
export type FindingWriteResult = typeof FindingWriteResult.Type;

/** The `POST /api/findings` failure body. */
export const FindingWriteError = Schema.Struct({ error: Schema.String });
