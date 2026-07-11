/**
 * The Review store: the read path over `.docent/`. Resolves (auto-creating on
 * first use) the Review for a branch and walks its append-only record
 * directories into a plain JSON snapshot the browser renders.
 *
 * The filesystem is the interface (data-model.md §1): docent is a renderer over
 * plain files, never a gate. The walk is best-effort — a record it cannot parse
 * is skipped, never fatal (architecture.md §3).
 */

import { Clock, Effect, Option, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import {
  ChangeRecord,
  FindingEntry,
  Review,
  ReviewSnapshot,
  ViewedEvent,
  WalkthroughEntry,
} from "@shared/schemas/review";
import type { ViewedRequest } from "@shared/schemas/review";
import { FindingRecord, RECORD_TYPES } from "@shared/schemas/finding";
import { Walkthrough, WalkthroughSection } from "@shared/schemas/walkthrough";

const STATE_ROOT = ".docent";
const GITIGNORE_ENTRY = `${STATE_ROOT}/`;

/** Directory name for a branch's Review: the branch name, slashes → dashes. */
export function branchSlug(branch: string): string {
  return branch.replaceAll("/", "-");
}

/** The absolute directory of a branch's Review under `<root>/.docent/`. */
export function reviewDirPath(root: string, branch: string): string {
  return `${root}/${STATE_ROOT}/reviews/${branchSlug(branch)}`;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A ULID-shaped opaque id under `prefix`: `<prefix>_` + 10 time chars + 16
 * random chars, Crockford base32. The time head keeps ids lexically sortable by
 * mint order — which is also the append-only `viewed/` file order.
 */
export const makeId = Effect.fn("makeId")(function* makeId(prefix: string) {
  const now = yield* Clock.currentTimeMillis;
  let time = now;
  let head = "";
  for (let i = 0; i < 10; i += 1) {
    head = CROCKFORD.charAt(time % 32) + head;
    time = Math.floor(time / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let tail = "";
  for (const byte of bytes) {
    tail += CROCKFORD.charAt(byte % 32);
  }
  return `${prefix}_${head}${tail}`;
});

/** Decode a JSON file against a schema; `None` on any read/parse/decode failure. */
export const readRecord = Effect.fn("readRecord")(function* readRecord<S extends Schema.Constraint>(
  file: string,
  schema: S,
) {
  const fs = yield* FileSystem;
  const text = yield* fs.readFileString(file);
  const json = yield* Effect.try(() => JSON.parse(text));
  return yield* Schema.decodeUnknownEffect(schema)(json);
}, Effect.option);

/** Unwrap the `Some` values of an Options array (best-effort walk survivors). */
function somes<A>(options: readonly Option.Option<A>[]): A[] {
  const values: A[] = [];
  for (const option of options) {
    if (Option.isSome(option)) {
      values.push(option.value);
    }
  }
  return values;
}

/** List a directory's entries, or `[]` when it does not exist. */
export const listDir = Effect.fn("listDir")(function* listDir(dir: string) {
  const fs = yield* FileSystem;
  return yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
});

/** Read `review.json`, creating it (auto-create on first use) when absent. */
export const ensureReview = Effect.fn("ensureReview")(function* ensureReview(params: {
  reviewDir: string;
  branch: string;
  base: string;
}) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  const file = path.join(params.reviewDir, "review.json");

  const existing = yield* readRecord(file, Review);
  if (Option.isSome(existing)) {
    return existing.value;
  }

  const id = yield* makeId("rev");
  const review = Review.make({
    base: params.base,
    branch: params.branch,
    id,
    schema: "docent/review@4",
  });
  yield* fs.makeDirectory(params.reviewDir, { recursive: true });
  yield* fs.writeFileString(file, `${JSON.stringify(review, null, 2)}\n`);
  return review;
});

/** Decode every `*.json` in `<reviewDir>/<sub>`, skipping records that fail. */
const readJsonRecords = Effect.fn("readJsonRecords")(function* readJsonRecords<
  S extends Schema.Constraint,
>(reviewDir: string, sub: string, schema: S) {
  const path = yield* Path;
  const dir = path.join(reviewDir, sub);
  const names = (yield* listDir(dir)).filter((name) => name.endsWith(".json")).toSorted();
  const records = yield* Effect.forEach(names, (name) => readRecord(path.join(dir, name), schema), {
    concurrency: "unbounded",
  });
  return somes(records);
});

// A record filename is `NNN-<type>.md`; the suffix is the record type (the
// frontmatter carries no type field — data-model.md §5.1). The type vocabulary
// is owned by the schema, so the pattern is derived from it, never re-spelled.
const RECORD_NAME = new RegExp(`^\\d+-(?<type>${RECORD_TYPES.join("|")})\\.md$`);
// Split a record into its YAML frontmatter envelope and markdown body. A file
// without the `---` fences yields empty frontmatter, so it fails to decode and
// is skipped — the best-effort walk (architecture.md §3).
const FRONTMATTER = /^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n?---\r?\n?(?<body>[\s\S]*)$/;

/**
 * Split a frontmatter-over-markdown file into its parsed YAML `meta` and trimmed
 * `body` — the shared envelope of Finding records and walkthrough sections
 * (data-model.md §5.1). A file without `---` fences yields empty `meta`, so the
 * caller's decode fails and the record is skipped (the best-effort walk).
 */
const parseEnvelope = Effect.fn("parseEnvelope")(function* parseEnvelope(text: string) {
  const match = FRONTMATTER.exec(text);
  const frontmatter = match?.groups?.frontmatter ?? "";
  const body = (match?.groups?.body ?? "").trim();
  const meta = yield* Effect.try(() => Bun.YAML.parse(frontmatter) ?? {});
  return { body, meta: meta as object };
});

/** Parse one `NNN-<type>.md` record; `None` on any read/parse/decode failure. */
const readFindingRecord = Effect.fn("readFindingRecord")(function* readFindingRecord(
  file: string,
  name: string,
) {
  const fs = yield* FileSystem;
  const text = yield* fs.readFileString(file);
  const { body, meta } = yield* parseEnvelope(text);
  const type = RECORD_NAME.exec(name)?.groups?.type;
  return yield* Schema.decodeUnknownEffect(FindingRecord)({ ...meta, body, name, type });
}, Effect.option);

const ANCHOR_FILE = /\bfile:\s*(?<file>[^,}\n]+)/;
const SURROUNDING_QUOTES = /^["']|["']$/g;

/**
 * Lift the anchored `file` of a Finding root record, best-effort. The anchor is
 * an inline flow map in the frontmatter (data-model.md §5.3), e.g.
 * `anchor: { kind: line, file: src/app.ts, side: head, ... }`. Only the `line`/
 * `file` code arms carry a `file`; every other arm (or an unparseable record)
 * yields no `anchorFile`. This is deliberately a lightweight extractor, not a
 * YAML parse — the full record fold belongs to the Findings panel.
 */
export function parseAnchor(markdown: string): { anchorFile?: string } {
  const frontmatter = FRONTMATTER.exec(markdown)?.groups?.frontmatter;
  if (frontmatter === undefined) {
    return {};
  }
  const start = frontmatter.indexOf("anchor:");
  if (start === -1) {
    return {};
  }
  // Bound the scan to the anchor's own flow map so a later key can't leak in.
  const rest = frontmatter.slice(start);
  const close = rest.indexOf("}");
  const scope = close === -1 ? (rest.split("\n")[0] ?? rest) : rest.slice(0, close + 1);

  const rawFile = ANCHOR_FILE.exec(scope)?.groups?.file?.trim();
  const file = rawFile?.replaceAll(SURROUNDING_QUOTES, "");
  return file ? { anchorFile: file } : {};
}

/** Read and parse a finding root record's anchor; empty on any read failure. */
const readAnchor = Effect.fn("readAnchor")(function* readAnchor(file: string) {
  const fs = yield* FileSystem;
  const text = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => ""));
  return parseAnchor(text);
});

/** Walk one finding's directory, parsing each record and folding its anchor. */
const readFinding = Effect.fn("readFinding")(function* readFinding(dir: string, id: string) {
  const path = yield* Path;
  const names = (yield* listDir(path.join(dir, id)))
    .filter((name) => name.endsWith(".md"))
    .toSorted();
  const parsed = yield* Effect.forEach(
    names,
    (name) => readFindingRecord(path.join(dir, id, name), name),
    { concurrency: "unbounded" },
  );
  // The root record carries the anchor: the `*-open.md`, else the first record.
  const root = names.find((name) => name.endsWith("-open.md")) ?? names[0];
  const anchor = root === undefined ? {} : yield* readAnchor(path.join(dir, id, root));
  return FindingEntry.make({ id, records: somes(parsed), ...anchor });
});

const readFindings = Effect.fn("readFindings")(function* readFindings(reviewDir: string) {
  const path = yield* Path;
  const dir = path.join(reviewDir, "findings");
  const ids = (yield* listDir(dir)).filter((name) => name.startsWith("fnd_")).toSorted();
  return yield* Effect.forEach(ids, (id) => readFinding(dir, id), { concurrency: "unbounded" });
});

/**
 * Parse one `docent/walkthrough-section@2` file: the same frontmatter/body
 * envelope split as a Finding record (YAML frontmatter over a markdown body).
 * The lifted `body` rides the decoded section so the client renders prose and
 * ranges from one record. `None` on any read/parse/decode failure — the
 * best-effort walk (architecture.md §3).
 */
const readWalkthroughSection = Effect.fn("readWalkthroughSection")(function* readWalkthroughSection(
  file: string,
) {
  const fs = yield* FileSystem;
  const text = yield* fs.readFileString(file);
  const { body, meta } = yield* parseEnvelope(text);
  return yield* Schema.decodeUnknownEffect(WalkthroughSection)({ ...meta, body });
}, Effect.option);

/**
 * Walk one walkthrough's directory: parse its `manifest.json`, then parse its
 * sections in the manifest's array order (the order IS the tour, walkthroughs.md
 * §4). The manifest's `kind` wins over the dir-derived one; sections that fail
 * to parse are dropped, keeping the rest. A manifest-less dir yields no sections
 * (order is undefined without one).
 */
const readWalkthrough = Effect.fn("readWalkthrough")(function* readWalkthrough(
  dir: string,
  kind: "code" | "product",
  id: string,
) {
  const path = yield* Path;
  const wlkDir = path.join(dir, id);
  const manifest = yield* readRecord(path.join(wlkDir, "manifest.json"), Walkthrough);
  const manifestValue = Option.getOrUndefined(manifest);
  const names = manifestValue?.sections ?? [];
  const parsed = yield* Effect.forEach(
    names,
    (name) => readWalkthroughSection(path.join(wlkDir, name)),
    { concurrency: "unbounded" },
  );
  return WalkthroughEntry.make({
    id,
    kind: manifestValue?.kind ?? kind,
    sections: somes(parsed),
    ...(manifestValue === undefined ? {} : { manifest: manifestValue }),
  });
});

/** Walk one walkthrough kind (`code`/`product`) into its entries. */
const readWalkthroughKind = Effect.fn("readWalkthroughKind")(function* readWalkthroughKind(
  root: string,
  kind: "code" | "product",
) {
  const path = yield* Path;
  const dir = path.join(root, kind);
  const ids = (yield* listDir(dir)).filter((name) => name.startsWith("wlk_")).toSorted();
  return yield* Effect.forEach(ids, (id) => readWalkthrough(dir, kind, id), {
    concurrency: "unbounded",
  });
});

const readWalkthroughs = Effect.fn("readWalkthroughs")(function* readWalkthroughs(
  reviewDir: string,
) {
  const path = yield* Path;
  const root = path.join(reviewDir, "walkthroughs");
  const entries = yield* Effect.forEach(
    ["code", "product"] as const,
    (kind) => readWalkthroughKind(root, kind),
    { concurrency: "unbounded" },
  );
  return entries.flat();
});

/**
 * Resolve the Review for `branch` under `root` (auto-creating it on first use)
 * and walk its records into a snapshot. Uncached: the caller re-reads on every
 * request, and the client re-fetches on every SSE change event.
 */
export const readReviewSnapshot = Effect.fn("readReviewSnapshot")(
  function* readReviewSnapshot(params: { root: string; branch: string; base: string }) {
    const path = yield* Path;
    const reviewDir = path.join(params.root, STATE_ROOT, "reviews", branchSlug(params.branch));

    const review = yield* ensureReview({
      base: params.base,
      branch: params.branch,
      reviewDir,
    });
    const [changes, findings, walkthroughs, viewed] = yield* Effect.all(
      [
        readJsonRecords(reviewDir, "changes", ChangeRecord),
        readFindings(reviewDir),
        readWalkthroughs(reviewDir),
        readJsonRecords(reviewDir, "viewed", ViewedEvent),
      ],
      { concurrency: "unbounded" },
    );

    return ReviewSnapshot.make({
      changes,
      findings,
      review,
      viewed,
      walkthroughs,
    });
  },
);

/**
 * Append one mark-as-viewed event to the Review's `viewed/` directory
 * (data-model.md §8). Directory-of-files, append-only: every toggle is a new
 * `vew_*.json`, never a rewrite — so there is no lock and no read-modify-write.
 * The server stamps `ts`; the Review auto-creates on first use so the very
 * first mark has a home. The write trips the `.docent/` watch, which re-pushes
 * the snapshot over SSE — the client's viewed state and progress refresh live.
 */
export const appendViewedEvent = Effect.fn("appendViewedEvent")(
  function* appendViewedEvent(params: {
    root: string;
    branch: string;
    base: string;
    request: ViewedRequest;
  }) {
    const fs = yield* FileSystem;
    const path = yield* Path;
    const reviewDir = path.join(params.root, STATE_ROOT, "reviews", branchSlug(params.branch));
    yield* ensureReview({ base: params.base, branch: params.branch, reviewDir });

    const viewedDir = path.join(reviewDir, "viewed");
    yield* fs.makeDirectory(viewedDir, { recursive: true });

    const now = yield* Clock.currentTimeMillis;
    const event = ViewedEvent.make({
      blobSha: params.request.blobSha,
      path: params.request.path,
      ts: new Date(now).toISOString(),
    });
    const id = yield* makeId("vew");
    yield* fs.writeFileString(
      path.join(viewedDir, `${id}.json`),
      `${JSON.stringify(event, null, 2)}\n`,
    );
    return event;
  },
);

/**
 * Ensure `.docent/` stays out of git history by adding it to the repo's
 * `.gitignore` (data-model.md §1: in-repo but gitignored). Idempotent and
 * best-effort — a missing or unwritable `.gitignore` is not fatal.
 */
export const ensureGitignore = Effect.fn("ensureGitignore")(function* ensureGitignore(
  root: string,
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  const file = path.join(root, ".gitignore");

  const current = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => ""));
  const ignored = current.split("\n").some((line) => line.trim().replace(/\/$/, "") === STATE_ROOT);
  if (ignored) {
    return;
  }

  const prefix = current === "" || current.endsWith("\n") ? current : `${current}\n`;
  yield* fs.writeFileString(file, `${prefix}${GITIGNORE_ENTRY}\n`);
});
