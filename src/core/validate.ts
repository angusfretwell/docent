/**
 * The schema oracle: decodes every record in a `.docent/` tree against the same
 * `shared/` schemas the runtime reads with, reporting failures. Non-gating (a
 * report, never a lock) and git-free — the strict mirror of the best-effort
 * snapshot reader, surfacing every decode failure the reader silently skips.
 */

import { walkthroughKinds } from "@shared/enums/walkthrough-kind";
import type { WalkthroughKind } from "@shared/enums/walkthrough-kind";
import { ChangeRecord, Review, ViewedEvent } from "@shared/schemas/review";
import { Walkthrough } from "@shared/schemas/walkthrough";
import { Effect, Match } from "effect";
import type { Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import type { PlatformError } from "effect/PlatformError";

import {
  decodeFindingRecord,
  decodeWalkthroughSection,
  listFindingIds,
  listJsonRecordNames,
  listMarkdownRecordNames,
  listWalkthroughIds,
} from "./store/enumerate";
import { decodeJsonRecord, listDir } from "./store/io";
import { STATE_ROOT } from "./store/layout";
import type { JsonParseFailed, YamlParseFailed } from "./store/parse";

export interface Problem {
  file: string;
  message: string;
}

/** `checked` counts every record decoded (valid or not); `problems` lists the failures in tree order. */
export interface ValidationReport {
  checked: number;
  problems: Problem[];
  stateRoot: string;
}

/**
 * A path already named `.docent`, or one that directly holds `reviews/`, is the
 * state root itself; otherwise it is `<base>/.docent`.
 */
export const resolveStateRoot = Effect.fn("resolveStateRoot")(
  function* resolveStateRoot(base: string) {
    const fs = yield* FileSystem;
    const path = yield* Path;

    if (path.basename(base) === STATE_ROOT) {
      return base;
    }

    const holdsReviews = yield* fs
      .exists(path.join(base, "reviews"))
      .pipe(Effect.orElseSucceed(() => false));
    return holdsReviews ? base : path.join(base, STATE_ROOT);
  }
);

const exists = Effect.fn("exists")(function* exists(file: string) {
  const fs = yield* FileSystem;
  return yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
});

type DecodeFailure = JsonParseFailed | Schema.SchemaError | YamlParseFailed;

interface Task {
  decode: (text: string) => Effect.Effect<unknown, DecodeFailure>;
  file: string;
  rel: string;
}

type CheckFailure = DecodeFailure | PlatformError;

const errorMessage = Match.typeTags<CheckFailure, string>()({
  JsonParseFailed: (error) => error.reason,
  PlatformError: (error) => error.message,
  SchemaError: (error) => error.issue.toString(),
  YamlParseFailed: (error) => error.reason,
});

/** Collapses a multi-line schema-decode tree onto one grep-friendly line. */
function formatError(error: CheckFailure): string {
  return errorMessage(error).replaceAll(/\s+/g, " ").trim();
}

const check = Effect.fn("check")(function* check(task: Task) {
  const fs = yield* FileSystem;
  return yield* fs.readFileString(task.file).pipe(
    Effect.flatMap(task.decode),
    Effect.match({
      onFailure: (error): Problem | undefined => ({
        file: task.rel,
        message: formatError(error),
      }),
      onSuccess: (): Problem | undefined => undefined,
    })
  );
});

const walkthroughTasks = Effect.fn("walkthroughTasks")(
  function* walkthroughTasks(
    reviewDir: string,
    kind: WalkthroughKind,
    toTask: (file: string, decode: Task["decode"]) => Task
  ) {
    const path = yield* Path;
    const kindDir = path.join(reviewDir, "walkthroughs", kind);
    const ids = yield* listWalkthroughIds(kindDir);
    const tasks: Task[] = [];
    for (const id of ids) {
      const walkthroughDir = path.join(kindDir, id);

      const manifest = path.join(walkthroughDir, "manifest.json");
      if (yield* exists(manifest)) {
        tasks.push(
          toTask(manifest, (text) => decodeJsonRecord(text, Walkthrough))
        );
      }

      // Every `.md` is checked, independent of the manifest's declared
      // `sections` — a stray or unlisted section must still validate.
      const sections = yield* listMarkdownRecordNames(walkthroughDir);
      for (const section of sections) {
        tasks.push(
          toTask(path.join(walkthroughDir, section), decodeWalkthroughSection)
        );
      }
    }
    return tasks;
  }
);

const reviewTasks = Effect.fn("reviewTasks")(function* reviewTasks(
  stateRoot: string,
  slug: string
) {
  const path = yield* Path;
  const reviewDir = path.join(stateRoot, "reviews", slug);

  // Path relative to the state root, so a report reads the same wherever the
  // tree lives on disk.
  function toTask(file: string, decode: Task["decode"]): Task {
    return { decode, file, rel: path.relative(stateRoot, file) };
  }

  const tasks: Task[] = [];

  const reviewJson = path.join(reviewDir, "review.json");
  if (yield* exists(reviewJson)) {
    tasks.push(toTask(reviewJson, (text) => decodeJsonRecord(text, Review)));
  }

  for (const [sub, schema] of [
    ["changes", ChangeRecord],
    ["viewed", ViewedEvent],
  ] as const) {
    const dir = path.join(reviewDir, sub);
    const names = yield* listJsonRecordNames(dir);
    for (const name of names) {
      tasks.push(
        toTask(path.join(dir, name), (text) => decodeJsonRecord(text, schema))
      );
    }
  }

  const findingsDir = path.join(reviewDir, "findings");
  const findingIds = yield* listFindingIds(findingsDir);
  for (const id of findingIds) {
    const findingDir = path.join(findingsDir, id);
    const records = yield* listMarkdownRecordNames(findingDir);
    for (const name of records) {
      tasks.push(
        toTask(path.join(findingDir, name), (text) =>
          decodeFindingRecord(text, name)
        )
      );
    }
  }

  for (const kind of walkthroughKinds) {
    tasks.push(...(yield* walkthroughTasks(reviewDir, kind, toTask)));
  }

  return tasks;
});

/**
 * All reviews under `reviews/` are validated (branch-agnostic, no git). Succeeds
 * even on an empty or absent tree — `checked` is then 0.
 */
export const validateStateRoot = Effect.fn("validateStateRoot")(
  function* validateStateRoot(stateRoot: string) {
    const path = yield* Path;
    const slugs = (yield* listDir(path.join(stateRoot, "reviews"))).toSorted();
    const perReview = yield* Effect.forEach(
      slugs,
      (slug) => reviewTasks(stateRoot, slug),
      { concurrency: "unbounded" }
    );
    const tasks = perReview.flat();

    const results = yield* Effect.forEach(tasks, check, {
      concurrency: "unbounded",
    });
    const problems = results.filter(
      (problem): problem is Problem => problem !== undefined
    );

    return {
      checked: tasks.length,
      problems,
      stateRoot,
    } satisfies ValidationReport;
  }
);
