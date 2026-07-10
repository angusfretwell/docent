/**
 * The `GET /api/dossier` wire shapes — the JSON snapshot the server walks out of
 * a Dossier's `.docent/dossiers/<branch-slug>/` tree and the browser renders.
 * Runtime-neutral: no Bun or DOM globals here, shared by server and client.
 *
 * Named per CONTEXT.md and docs/spec/data-model.md §2–3: the Dossier is the
 * durable per-branch file of record; its `changes/`, `findings/`,
 * `walkthroughs/`, and `viewed/` directories ARE the append-only history — no
 * index or pointer file. This slice reads them; folding drift and what's-next
 * off findings is deferred to the panels that own them.
 */

import { Schema } from "effect";

/** `docent/dossier@3` — the `dossier.json` identity record (data-model.md §3). */
export class Dossier extends Schema.Class<Dossier>("Dossier")({
  schema: Schema.Literal("docent/dossier@3"),
  /** Stable opaque id (ULID-based). */
  id: Schema.String,
  /** The branch name — the Dossier's identity. */
  branch: Schema.String,
  /** Base ref recorded at creation (default: repo default branch). */
  base: Schema.String,
}) {}

/** `docent/change@3` — one immutable minted-Change record (data-model.md §4). */
export class ChangeRecord extends Schema.Class<ChangeRecord>("ChangeRecord")({
  schema: Schema.Literal("docent/change@3"),
  /** Sequential per-Dossier id: `chg_001`, `chg_002`, … */
  id: Schema.String,
  baseSha: Schema.String,
  headSha: Schema.String,
  baseRef: Schema.String,
  headRef: Schema.String,
  capturedAt: Schema.String,
}) {}

/** An append-only mark-as-viewed event (`viewed/*.json`, data-model.md §8). */
export class ViewedEvent extends Schema.Class<ViewedEvent>("ViewedEvent")({
  path: Schema.String,
  blobSha: Schema.String,
  ts: Schema.String,
}) {}

/**
 * A Finding as walked in this slice: its record-dir id plus the sorted names of
 * its append-only record files. Folding the records into anchor/what's-next/
 * drift is owned by the Findings panel (a later slice); the snapshot only needs
 * to reflect that the directory exists and changed.
 */
export class FindingEntry extends Schema.Class<FindingEntry>("FindingEntry")({
  id: Schema.String,
  records: Schema.Array(Schema.String),
}) {}

/** A Walkthrough as walked in this slice: pillar, id, and its file names. */
export class WalkthroughEntry extends Schema.Class<WalkthroughEntry>(
  "WalkthroughEntry",
)({
  kind: Schema.Literals(["code", "product"]),
  id: Schema.String,
  files: Schema.Array(Schema.String),
}) {}

/**
 * The `GET /api/dossier` body: the Dossier identity plus its walked records.
 * Uncached — the client re-fetches on every SSE change event.
 */
export class DossierSnapshot extends Schema.Class<DossierSnapshot>(
  "DossierSnapshot",
)({
  dossier: Dossier,
  changes: Schema.Array(ChangeRecord),
  findings: Schema.Array(FindingEntry),
  walkthroughs: Schema.Array(WalkthroughEntry),
  viewed: Schema.Array(ViewedEvent),
}) {}

/** The `GET /api/dossier` failure body (HTTP 500). */
export const DossierError = Schema.Struct({ error: Schema.String });
