/**
 * The `POST /api/findings` request and response shapes, shared by the browser
 * client (producer) and the Bun server (consumer). Runtime-neutral: no Bun or
 * DOM globals here.
 *
 * A write is one append-only record drop — a new Finding (`open`), a `reply`,
 * an `action`, a `resolve`, a `reopen`, or an `edit` (which supersedes an
 * earlier record's body) — the identical shape an agent writes directly into
 * `.docent/`. The request never carries attribution: the UI is definitionally
 * the human, so the server stamps the author from git config.
 */

import { Schema } from "effect";

import { Anchor } from "./finding";
import { ChangeId, FindingId } from "./ids";

/** Open a new Finding: the root record carries the content-addressed anchor. */
const OpenWrite = Schema.Struct({
  anchor: Anchor,
  body: Schema.String,
  op: Schema.Literal("open"),
});

/** Reply on an existing Finding; being the latest record, it returns it to open. */
const ReplyWrite = Schema.Struct({
  body: Schema.String,
  findingId: FindingId,
  op: Schema.Literal("reply"),
});

/** Hand a Finding back: the turn is taken, whatever its outcome. */
const ActionWrite = Schema.Struct({
  findingId: FindingId,
  op: Schema.Literal("action"),
});

/** Resolve a Finding. */
const ResolveWrite = Schema.Struct({
  findingId: FindingId,
  op: Schema.Literal("resolve"),
});

/** Reopen a resolved Finding. */
const ReopenWrite = Schema.Struct({
  findingId: FindingId,
  op: Schema.Literal("reopen"),
});

/**
 * Edit an earlier record's body: `edits` names the target record's filename
 * (e.g. `002-reply.md`), and `body` is the superseding text the fold applies at
 * read time. Append-only — the original record is never rewritten.
 */
const EditWrite = Schema.Struct({
  body: Schema.String,
  // `edits` names the superseded record's *filename* (e.g. `002-reply.md`), not
  // a record id — it stays a plain string, unlike `findingId`.
  edits: Schema.String,
  findingId: FindingId,
  op: Schema.Literal("edit"),
});

/** The `POST /api/findings` request body — one append-only record to drop. */
export const FindingWrite = Schema.Union([
  OpenWrite,
  ReplyWrite,
  ActionWrite,
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
  changeId: ChangeId,
  findingId: FindingId,
  record: Schema.String,
});
export type FindingWriteResult = typeof FindingWriteResult.Type;

/** The `POST /api/findings` failure body. */
export const FindingWriteError = Schema.Struct({ error: Schema.String });
