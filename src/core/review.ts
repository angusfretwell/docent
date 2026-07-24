/**
 * The Review store: the read path over `.docent/`. Resolves (auto-creating on
 * first use) the Review for a branch and walks its append-only record
 * directories into a plain JSON snapshot the browser renders.
 *
 * The filesystem is the interface (data-model.md §1): docent is a renderer over
 * plain files, never a gate. The walk is best-effort — a record it cannot parse
 * is skipped, never fatal (architecture.md §3).
 */

import {
  ChangeRecord,
  FindingEntry,
  Review,
  ReviewSnapshot,
  ViewedEvent,
  WalkthroughEntry,
} from "@shared/schemas/review";
import type { ViewedRequest } from "@shared/schemas/review";
import type { FindingId, WalkthroughId } from "@shared/schemas/ids";
import { walkthroughKinds } from "@shared/enums/walkthrough-kind";
import type { WalkthroughKind } from "@shared/enums/walkthrough-kind";
import { Walkthrough } from "@shared/schemas/walkthrough";
import type { Schema } from "effect";
import { Clock, Effect, Option } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import {
  listFindingIds,
  listJsonRecordNames,
  listMarkdownRecordNames,
  listWalkthroughIds,
  readFindingRecord,
  readWalkthroughSection,
} from "./store/enumerate";
import { makeId } from "./store/id";
import { readRecord, writeJsonRecord } from "./store/io";
import {
  branchSlug,
  ensureStateRootGitignore,
  reviewDirPath,
  STATE_ROOT,
} from "./store/layout";
import { FRONTMATTER } from "./store/records";

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

/** Read `review.json`, creating it (auto-create on first use) when absent. */
export const ensureReview = Effect.fn("ensureReview")(
  function* ensureReview(params: {
    root: string;
    reviewDir: string;
    branch: string;
    base: string;
  }) {
    const fs = yield* FileSystem;
    const path = yield* Path;
    const file = path.join(params.reviewDir, "review.json");

    // Seed the commit policy the moment `.docent` first materializes, so the
    // machine-local records this write is about to create never leak into git.
    yield* ensureStateRootGitignore(params.root);

    const existing = yield* readRecord(file, Review);
    if (Option.isSome(existing)) {
      return existing.value;
    }

    const id = yield* makeId("rev");
    const review = Review.make({
      base: params.base,
      branch: params.branch,
      id,
      schema: "docent/review",
      title: "",
    });
    yield* fs.makeDirectory(params.reviewDir, { recursive: true });
    yield* writeJsonRecord(file, review);
    return review;
  }
);

/**
 * Name the change under review, keeping the Review's identity. Unlike every
 * other record under `.docent/`, `review.json` is a singleton identity record
 * rather than an append-only log — so a rename rewrites it in place, preserving
 * the `id` the branch was minted with.
 */
export const setReviewTitle = Effect.fn("setReviewTitle")(
  function* setReviewTitle(params: {
    root: string;
    branch: string;
    base: string;
    title: string;
  }) {
    const path = yield* Path;
    const reviewDir = reviewDirPath(params.root, params.branch);

    const existing = yield* ensureReview({
      base: params.base,
      branch: params.branch,
      reviewDir,
      root: params.root,
    });
    const review = Review.make({
      base: existing.base,
      branch: existing.branch,
      id: existing.id,
      schema: "docent/review",
      title: params.title,
    });

    yield* writeJsonRecord(path.join(reviewDir, "review.json"), review);
    return review;
  }
);

/** Decode every `*.json` in `<reviewDir>/<sub>`, skipping records that fail. */
const readJsonRecords = Effect.fn("readJsonRecords")(function* readJsonRecords<
  S extends Schema.Constraint,
>(reviewDir: string, sub: string, schema: S) {
  const path = yield* Path;
  const dir = path.join(reviewDir, sub);
  const names = yield* listJsonRecordNames(dir);
  const records = yield* Effect.forEach(
    names,
    (name) => readRecord(path.join(dir, name), schema),
    {
      concurrency: "unbounded",
    }
  );
  return somes(records);
});

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
  const scope =
    close === -1 ? (rest.split("\n")[0] ?? rest) : rest.slice(0, close + 1);

  const rawFile = ANCHOR_FILE.exec(scope)?.groups?.file?.trim();
  const file = rawFile?.replaceAll(SURROUNDING_QUOTES, "");
  return file ? { anchorFile: file } : {};
}

/** Read and parse a finding root record's anchor; empty on any read failure. */
const readAnchor = Effect.fn("readAnchor")(function* readAnchor(file: string) {
  const fs = yield* FileSystem;
  const text = yield* fs
    .readFileString(file)
    .pipe(Effect.orElseSucceed(() => ""));
  return parseAnchor(text);
});

/** Walk one finding's directory, parsing each record and folding its anchor. */
const readFinding = Effect.fn("readFinding")(function* readFinding(
  dir: string,
  id: string
) {
  const path = yield* Path;
  const names = yield* listMarkdownRecordNames(path.join(dir, id));
  const parsed = yield* Effect.forEach(
    names,
    (name) => readFindingRecord(path.join(dir, id, name), name),
    { concurrency: "unbounded" }
  );
  // The root record carries the anchor: the `*-open.md`, else the first record.
  const root = names.find((name) => name.endsWith("-open.md")) ?? names[0];
  const anchor =
    root === undefined ? {} : yield* readAnchor(path.join(dir, id, root));
  // `id` is the record dir name, minted `fnd_…` (or hand-authored); the read
  // path trusts the on-disk structure, so brand it rather than re-validate.
  return FindingEntry.make({
    id: id as FindingId,
    records: somes(parsed),
    ...anchor,
  });
});

const readFindings = Effect.fn("readFindings")(function* readFindings(
  reviewDir: string
) {
  const path = yield* Path;
  const dir = path.join(reviewDir, "findings");
  const ids = yield* listFindingIds(dir);
  return yield* Effect.forEach(ids, (id) => readFinding(dir, id), {
    concurrency: "unbounded",
  });
});

/**
 * Walk one walkthrough's directory: parse its `manifest.json`, then parse its
 * sections in the manifest's array order (the order IS the tour, walkthroughs.md
 * §4). The manifest's `kind` wins over the dir-derived one; sections that fail
 * to parse are dropped, keeping the rest. A manifest-less dir yields no sections
 * (order is undefined without one).
 */
const readWalkthrough = Effect.fn("readWalkthrough")(function* readWalkthrough(
  dir: string,
  kind: WalkthroughKind,
  id: string
) {
  const path = yield* Path;
  const wlkDir = path.join(dir, id);
  const manifest = yield* readRecord(
    path.join(wlkDir, "manifest.json"),
    Walkthrough
  );
  const manifestValue = Option.getOrUndefined(manifest);
  const names = manifestValue?.sections ?? [];
  const parsed = yield* Effect.forEach(
    names,
    (name) => readWalkthroughSection(path.join(wlkDir, name)),
    { concurrency: "unbounded" }
  );
  return WalkthroughEntry.make({
    id: id as WalkthroughId,
    kind: manifestValue?.kind ?? kind,
    sections: somes(parsed),
    ...(manifestValue === undefined ? {} : { manifest: manifestValue }),
  });
});

/** Walk one walkthrough kind (`code`/`product`) into its entries. */
const readWalkthroughKind = Effect.fn("readWalkthroughKind")(
  function* readWalkthroughKind(root: string, kind: WalkthroughKind) {
    const path = yield* Path;
    const dir = path.join(root, kind);
    const ids = yield* listWalkthroughIds(dir);
    return yield* Effect.forEach(ids, (id) => readWalkthrough(dir, kind, id), {
      concurrency: "unbounded",
    });
  }
);

const readWalkthroughs = Effect.fn("readWalkthroughs")(
  function* readWalkthroughs(reviewDir: string) {
    const path = yield* Path;
    const root = path.join(reviewDir, "walkthroughs");
    const entries = yield* Effect.forEach(
      walkthroughKinds,
      (kind) => readWalkthroughKind(root, kind),
      { concurrency: "unbounded" }
    );
    return entries.flat();
  }
);

/**
 * Resolve the Review for `branch` under `root` (auto-creating it on first use)
 * and walk its records into a snapshot. Uncached: the caller re-reads on every
 * request, and the client re-fetches on every SSE change event.
 */
export const readReviewSnapshot = Effect.fn("readReviewSnapshot")(
  function* readReviewSnapshot(params: {
    root: string;
    branch: string;
    base: string;
  }) {
    const path = yield* Path;
    const reviewDir = path.join(
      params.root,
      STATE_ROOT,
      "reviews",
      branchSlug(params.branch)
    );

    const review = yield* ensureReview({
      base: params.base,
      branch: params.branch,
      reviewDir,
      root: params.root,
    });
    const [changes, findings, walkthroughs, viewed] = yield* Effect.all(
      [
        readJsonRecords(reviewDir, "changes", ChangeRecord),
        readFindings(reviewDir),
        readWalkthroughs(reviewDir),
        readJsonRecords(reviewDir, "viewed", ViewedEvent),
      ],
      { concurrency: "unbounded" }
    );

    return ReviewSnapshot.make({
      changes,
      findings,
      review,
      viewed,
      walkthroughs,
    });
  }
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
    const reviewDir = path.join(
      params.root,
      STATE_ROOT,
      "reviews",
      branchSlug(params.branch)
    );
    yield* ensureReview({
      base: params.base,
      branch: params.branch,
      reviewDir,
      root: params.root,
    });

    const viewedDir = path.join(reviewDir, "viewed");
    yield* fs.makeDirectory(viewedDir, { recursive: true });

    const now = yield* Clock.currentTimeMillis;
    const event = ViewedEvent.make({
      blobSha: params.request.blobSha,
      path: params.request.path,
      ts: new Date(now).toISOString(),
    });
    const id = yield* makeId("vew");
    yield* writeJsonRecord(path.join(viewedDir, `${id}.json`), event);
    return event;
  }
);
