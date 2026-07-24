/**
 * The write primitives shared by every Change-scoped write. The Change for the
 * live head mints lazily and idempotently by `(baseSha, headSha)`, and every
 * record stamps the `changeId` current at write — no locks, a mutation is a new
 * file, never a rewrite.
 */

import { ChangeId } from "@shared/schemas/ids";
import { ChangeRecord } from "@shared/schemas/review";
import { Clock, Effect, Option } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { max } from "radashi";

import { resolveChangeRefs } from "./git";
import { ensureReview } from "./review";
import { listDir, readRecord, writeJsonRecord } from "./store/io";
import { reviewDirPath } from "./store/layout";

export interface ChangeRefs {
  baseSha: string;
  headSha: string;
  baseRef: string;
  headRef: string;
}

export const resolveChangeScope = Effect.fn("resolveChangeScope")(
  function* resolveChangeScope(cwd: string) {
    const { baseSha, branch, defaultBranch, headSha, root } =
      yield* resolveChangeRefs(cwd);
    return {
      base: defaultBranch.name,
      branch,
      refs: {
        baseRef: defaultBranch.name,
        baseSha,
        headRef: branch,
        headSha,
      },
      root,
    };
  }
);

export const now = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => new Date(millis).toISOString())
);

export function maxSequence(names: readonly string[], pattern: RegExp): number {
  const sequences = names.flatMap((name) => {
    const value = pattern.exec(name)?.groups?.n;
    return value === undefined ? [] : [Number(value)];
  });
  return max(sequences) ?? 0;
}

/**
 * Idempotent by `(baseSha, headSha)`: an existing matching `chg_NNN.json` is
 * reused, else the next sequential id is appended. Sequencing reads the max
 * on-disk `NNN`, so it survives gaps and skipped malformed records.
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
  yield* writeJsonRecord(path.join(dir, `${id}.json`), ChangeRecord, record);
  return record;
});

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
