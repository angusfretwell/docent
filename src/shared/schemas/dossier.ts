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

import { FindingRecord } from "./finding";
import { Walkthrough, WalkthroughSection } from "./walkthrough";

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
 * The `POST /api/viewed` request body: the file the reviewer toggled and its
 * head-blob SHA. The server stamps `ts` and appends the `{path, blobSha, ts}`
 * event — the client never authors the timestamp.
 */
export class ViewedRequest extends Schema.Class<ViewedRequest>("ViewedRequest")(
  {
    blobSha: Schema.String,
    path: Schema.String,
  }
) {}

/**
 * A Finding as walked in this slice: its record-dir id, its append-only records
 * (each parsed from a `NNN-<type>.md` file — a frontmatter envelope over a
 * markdown body), and a light fold of the root record's anchored file. Records
 * are carried whole — folding them into anchor/what's-next/participants is a
 * pure client-side read (see `foldFinding`), so the panel and future agent
 * surfaces share one derivation. On top of that, we lift the anchored file of
 * the `line`/`file` code arms so the Diff tab's has-findings tree filter can key
 * on it (diff-review.md §2). Best-effort: an unparseable anchor just omits the
 * field.
 */
export class FindingEntry extends Schema.Class<FindingEntry>("FindingEntry")({
  /** The root anchor's file path — present only for `line`/`file` code arms. */
  anchorFile: Schema.optional(Schema.String),
  id: Schema.String,
  records: Schema.Array(FindingRecord),
}) {}

/**
 * A Walkthrough as walked off disk: its dir id and pillar, its parsed
 * `manifest.json` (absent when unreadable), and its sections parsed in the
 * manifest's array order — the order IS the tour (walkthroughs.md §4). The code
 * tab folds these; a product walkthrough carries a manifest but no code
 * sections here (its capture rendering is a separate tab). Best-effort: an
 * unparseable manifest or section is dropped, never fatal.
 */
export class WalkthroughEntry extends Schema.Class<WalkthroughEntry>(
  "WalkthroughEntry"
)({
  id: Schema.String,
  kind: Schema.Literals(["code", "product"]),
  manifest: Schema.optional(Walkthrough),
  sections: Schema.Array(WalkthroughSection),
}) {}

/**
 * The `GET /api/dossier` body: the Dossier identity plus its walked records.
 * Uncached — the client re-fetches on every SSE change event.
 */
export class DossierSnapshot extends Schema.Class<DossierSnapshot>(
  "DossierSnapshot"
)({
  changes: Schema.Array(ChangeRecord),
  dossier: Dossier,
  findings: Schema.Array(FindingEntry),
  viewed: Schema.Array(ViewedEvent),
  walkthroughs: Schema.Array(WalkthroughEntry),
}) {}

/** The `GET /api/dossier` failure body (HTTP 500). */
export const DossierError = Schema.Struct({ error: Schema.String });
