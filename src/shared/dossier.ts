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
  /** Base ref recorded at creation (default: repo default branch). */
  base: Schema.String,
  /** The branch name — the Dossier's identity. */
  branch: Schema.String,
  /** Stable opaque id (ULID-based). */
  id: Schema.String,
  schema: Schema.Literal("docent/dossier@3"),
}) {}

/** `docent/change@3` — one immutable minted-Change record (data-model.md §4). */
export class ChangeRecord extends Schema.Class<ChangeRecord>("ChangeRecord")({
  baseRef: Schema.String,
  baseSha: Schema.String,
  capturedAt: Schema.String,
  headRef: Schema.String,
  headSha: Schema.String,
  /** Sequential per-Dossier id: `chg_001`, `chg_002`, … */
  id: Schema.String,
  schema: Schema.Literal("docent/change@3"),
}) {}

/** An append-only mark-as-viewed event (`viewed/*.json`, data-model.md §8). */
export class ViewedEvent extends Schema.Class<ViewedEvent>("ViewedEvent")({
  blobSha: Schema.String,
  path: Schema.String,
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
export class WalkthroughEntry extends Schema.Class<WalkthroughEntry>("WalkthroughEntry")({
  files: Schema.Array(Schema.String),
  id: Schema.String,
  kind: Schema.Literals(["code", "product"]),
}) {}

/**
 * The `GET /api/dossier` body: the Dossier identity plus its walked records.
 * Uncached — the client re-fetches on every SSE change event.
 */
export class DossierSnapshot extends Schema.Class<DossierSnapshot>("DossierSnapshot")({
  changes: Schema.Array(ChangeRecord),
  dossier: Dossier,
  findings: Schema.Array(FindingEntry),
  viewed: Schema.Array(ViewedEvent),
  walkthroughs: Schema.Array(WalkthroughEntry),
}) {}

/** The `GET /api/dossier` failure body (HTTP 500). */
export const DossierError = Schema.Struct({ error: Schema.String });
