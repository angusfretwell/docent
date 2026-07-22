/**
 * The write primitives shared by every Change-scoped write over `.docent/` —
 * the lazy, idempotent Change minting both write paths assemble before dropping
 * their own record. `findings-write.ts` (Finding records) and
 * `walkthrough-write.ts` (walkthroughs/sections/captures) both resolve this
 * identical context first; this is the one place it happens.
 *
 * Writing any record is a minting reference: the Change for the live head mints
 * lazily and idempotently by `(baseSha, headSha)`, and every record stamps the
 * `changeId` current at write. No locks, no read-modify-write — a mutation is a
 * new file, never a rewrite.
 */

import { ChangeId } from "@shared/schemas/ids";
import { ChangeRecord } from "@shared/schemas/review";
import { Clock, Effect, Option } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { max } from "radashi";

import { ensureReview } from "./review";
import { listDir, readRecord, writeJsonRecord } from "./store/io";
import { reviewDirPath } from "./store/layout";

/** The plain human/agent attribution a write stamps onto its record. */
export interface AuthorInput {
  kind: "human" | "agent";
  id: string;
  display: string;
  model?: string;
}

/** The resolved Change identity a write mints against (git-resolved refs). */
export interface ChangeRefs {
  baseSha: string;
  headSha: string;
  baseRef: string;
  headRef: string;
}

/** The write's timestamp, an ISO-8601 string from the wall clock. */
export const now = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => new Date(millis).toISOString())
);

/** The highest `NNN` numeric prefix across `NNN-…`/`chg_NNN` names, or 0. */
export function maxSequence(names: readonly string[], pattern: RegExp): number {
  const sequences = names.flatMap((name) => {
    const value = pattern.exec(name)?.groups?.n;
    return value === undefined ? [] : [Number(value)];
  });
  return max(sequences) ?? 0;
}

/**
 * Mint the Change for the live head, or idempotently reuse it. The same
 * `(baseSha, headSha)` never mints twice: an existing matching `chg_NNN.json` is
 * returned as-is; otherwise the next sequential id is appended. Sequencing reads
 * the max on-disk `NNN` so it survives gaps and skipped malformed records
 * (data-model.md §4).
 */
export const mintChange = Effect.fn("mintChange")(function* mintChange(params: {
  reviewDir: string;
  refs: ChangeRefs;
}) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  const dir = path.join(params.reviewDir, "changes");
  const names = (yield* listDir(dir))
    .filter((name) => name.endsWith(".json"))
    .toSorted();

  const existing = yield* Effect.forEach(
    names,
    (name) => readRecord(path.join(dir, name), ChangeRecord),
    { concurrency: "unbounded" }
  );
  for (const option of existing) {
    if (
      Option.isSome(option) &&
      option.value.baseSha === params.refs.baseSha &&
      option.value.headSha === params.refs.headSha
    ) {
      return option.value;
    }
  }

  const id = ChangeId.make(
    `chg_${String(maxSequence(names, /^chg_(?<n>\d+)\.json$/) + 1).padStart(3, "0")}`
  );
  const record = ChangeRecord.make({
    baseRef: params.refs.baseRef,
    baseSha: params.refs.baseSha,
    capturedAt: yield* now,
    headRef: params.refs.headRef,
    headSha: params.refs.headSha,
    id,
    schema: "docent/change",
  });
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* writeJsonRecord(path.join(dir, `${id}.json`), record);
  return record;
});

/**
 * Resolve the write scope shared by every Change-scoped write: the branch's
 * Review dir (auto-created on first use) and the live head's Change, minted
 * or reused for `refs` (data-model.md §4). `findings-write.ts` and
 * `walkthrough-write.ts` both assemble this identical context before writing
 * their own record; this is the one place it happens.
 */
export const resolveWriteContext = Effect.fn("resolveWriteContext")(
  function* resolveWriteContext(params: {
    root: string;
    branch: string;
    base: string;
    refs: ChangeRefs;
  }) {
    const reviewDir = reviewDirPath(params.root, params.branch);
    yield* ensureReview({
      base: params.base,
      branch: params.branch,
      reviewDir,
      root: params.root,
    });
    const change = yield* mintChange({ refs: params.refs, reviewDir });
    return { change, reviewDir };
  }
);
