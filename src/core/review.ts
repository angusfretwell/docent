/**
 * The read path over `.docent/`: best-effort — a record it cannot parse is
 * skipped, never fatal.
 */

import { walkthroughKinds } from "@shared/enums/walkthrough-kind";
import type { WalkthroughKind } from "@shared/enums/walkthrough-kind";
import { FindingId, ReviewId, WalkthroughId } from "@shared/schemas/ids";
import {
  ChangeRecord,
  FindingEntry,
  Review,
  ReviewSnapshot,
  ViewedEvent,
  WalkthroughEntry,
} from "@shared/schemas/review";
import type { ViewedRequest } from "@shared/schemas/review";
import { Walkthrough } from "@shared/schemas/walkthrough";
import { Array, Clock, Effect, Option, Schema } from "effect";
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

    // Seed the commit policy before creating any record, so machine-local
    // records never leak into git.
    yield* ensureStateRootGitignore(params.root);

    const existing = yield* readRecord(file, Review);
    if (Option.isSome(existing)) {
      return existing.value;
    }

    const id = yield* makeId(ReviewId, "rev");
    const review = Review.make({
      base: params.base,
      branch: params.branch,
      id,
      schema: "docent/review",
      title: "",
    });
    yield* fs.makeDirectory(params.reviewDir, { recursive: true });
    yield* writeJsonRecord(file, Review, review);
    return review;
  }
);

/**
 * Unlike every other `.docent/` record, `review.json` is a singleton — a rename
 * rewrites it in place, preserving the `id` the branch was minted with.
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

    yield* writeJsonRecord(path.join(reviewDir, "review.json"), Review, review);
    return review;
  }
);

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
  return Array.getSomes(records);
});

interface IdSchema<Id extends string> {
  readonly makeOption: (input: string) => Option.Option<Id>;
}

/** Drops every name the id schema's `<prefix>_` refinement rejects — best-effort, so one unusable dir name is skipped rather than failing the whole read. */
function recordIds<Id extends string>(
  schema: IdSchema<Id>,
  names: readonly string[]
): Id[] {
  return Array.getSomes(names.map((name) => schema.makeOption(name)));
}

const ANCHOR_FILE = /\bfile:\s*(?<file>[^,}\n]+)/;
const SURROUNDING_QUOTES = /^["']|["']$/g;

/**
 * A lightweight regex extractor, not a YAML parse: only the `line`/`file` arms
 * carry a `file`; every other arm or unparseable record yields none.
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

const readAnchor = Effect.fn("readAnchor")(function* readAnchor(file: string) {
  const fs = yield* FileSystem;
  const text = yield* fs
    .readFileString(file)
    .pipe(Effect.orElseSucceed(() => ""));
  return parseAnchor(text);
});

const readFinding = Effect.fn("readFinding")(function* readFinding(
  dir: string,
  id: FindingId
) {
  const path = yield* Path;
  const names = yield* listMarkdownRecordNames(path.join(dir, id));
  const parsed = yield* Effect.forEach(
    names,
    (name) => readFindingRecord(path.join(dir, id, name), name),
    { concurrency: "unbounded" }
  );
  const root = names.find((name) => name.endsWith("-open.md")) ?? names[0];
  const anchor =
    root === undefined ? {} : yield* readAnchor(path.join(dir, id, root));
  return FindingEntry.make({
    id,
    records: Array.getSomes(parsed),
    ...anchor,
  });
});

const readFindings = Effect.fn("readFindings")(function* readFindings(
  reviewDir: string
) {
  const path = yield* Path;
  const dir = path.join(reviewDir, "findings");
  const names = yield* listFindingIds(dir);

  return yield* Effect.forEach(
    recordIds(FindingId, names),
    (id) => readFinding(dir, id),
    { concurrency: "unbounded" }
  );
});

/**
 * Sections parse in the manifest's array order (the order IS the tour); the
 * manifest's `kind` wins over the dir-derived one; a manifest-less dir yields no
 * sections.
 */
const readWalkthrough = Effect.fn("readWalkthrough")(function* readWalkthrough(
  dir: string,
  kind: WalkthroughKind,
  id: WalkthroughId
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
    id,
    kind: manifestValue?.kind ?? kind,
    sections: Array.getSomes(parsed),
    ...(manifestValue === undefined ? {} : { manifest: manifestValue }),
  });
});

const readWalkthroughKind = Effect.fn("readWalkthroughKind")(
  function* readWalkthroughKind(root: string, kind: WalkthroughKind) {
    const path = yield* Path;
    const dir = path.join(root, kind);
    const names = yield* listWalkthroughIds(dir);

    return yield* Effect.forEach(
      recordIds(WalkthroughId, names),
      (id) => readWalkthrough(dir, kind, id),
      { concurrency: "unbounded" }
    );
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

/** Uncached: the caller re-reads on every request; the client re-fetches on every SSE change event. */
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
 * Append-only: every toggle is a new `vew_*.json`, never a rewrite — no lock, no
 * read-modify-write. The server stamps `ts`.
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
    // No `vew_` record id to brand — the event is addressed by filename alone,
    // so the mint runs through the plain string schema.
    const id = yield* makeId(Schema.String, "vew");
    yield* writeJsonRecord(
      path.join(viewedDir, `${id}.json`),
      ViewedEvent,
      event
    );
    return event;
  }
);
