/**
 * `docent validate` — the schema oracle (architecture.md §3, testing.md). It
 * walks any `.docent/` tree and decodes every record against the very same
 * `shared/` schemas the runtime reads with, reporting the records that fail. It
 * is **non-gating** (data-model.md §1): a report, never a lock — a caller runs
 * it to learn what is malformed, not to be stopped from writing.
 *
 * Where the snapshot reader (`services/review.ts`) is best-effort — it silently
 * drops a record it cannot parse so the UI degrades gracefully (architecture.md
 * §3) — validate is its strict mirror: the same envelope split and the same
 * schemas, but every decode failure is surfaced with the offending file. That
 * mirror is what makes the fixtures the test suite's oracle (testing.md): they
 * gate on validate reporting nothing. It never touches git, so it validates any
 * `.docent/` tree — a checked-out repo, a fixture, or a bare state root.
 */

import { FindingRecord } from "@shared/schemas/finding";
import { ChangeRecord, Review, ViewedEvent } from "@shared/schemas/review";
import { Walkthrough, WalkthroughSection } from "@shared/schemas/walkthrough";
import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { recordType, splitEnvelope } from "../lib/records";

const STATE_ROOT = ".docent";
const WALKTHROUGH_KINDS = ["code", "product"] as const;

/** One record that failed to decode: its path (relative to the state root) and why. */
export interface Problem {
  file: string;
  message: string;
}

/**
 * The outcome of validating a `.docent/` tree. Never a failure — validate is a
 * report: `checked` counts every record decoded (valid or not) and `problems`
 * lists the ones that failed, in tree order.
 */
export interface ValidationReport {
  checked: number;
  problems: Problem[];
  stateRoot: string;
}

/**
 * Resolve a `.docent/` state root from a base path. A path already named
 * `.docent`, or one that directly holds a `reviews/` directory (the committed
 * `fixtures/docent/` shape), is the state root itself; otherwise it is
 * `<base>/.docent` (a repo root). Pure filesystem — validate reads files alone,
 * so it works whether or not `base` is a checked-out git repo.
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

/** List a directory's entries sorted, or `[]` when it does not exist. */
const listDir = Effect.fn("listDir")(function* listDir(dir: string) {
  const fs = yield* FileSystem;
  const names = yield* fs
    .readDirectory(dir)
    .pipe(Effect.orElseSucceed(() => []));
  return names.toSorted();
});

/** Does a file exist? `false` on any stat failure — a missing file, never fatal. */
const exists = Effect.fn("exists")(function* exists(file: string) {
  const fs = yield* FileSystem;
  return yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
});

/** Decode a JSON record's text against `schema`. */
function decodeJson<S extends Schema.Constraint>(schema: S) {
  return (text: string) =>
    Effect.flatMap(
      Effect.try(() => JSON.parse(text) as unknown),
      Schema.decodeUnknownEffect(schema)
    );
}

/** Decode one `NNN-<type>.md` Finding record: split the envelope, then decode. */
function decodeFinding(name: string) {
  return (text: string) =>
    Effect.flatMap(splitEnvelope(text), ({ body, meta }) =>
      Schema.decodeUnknownEffect(FindingRecord)({
        ...meta,
        body,
        name,
        type: recordType(name),
      })
    );
}

/** Decode one walkthrough section file: split the envelope, then decode. */
function decodeSection(text: string) {
  return Effect.flatMap(splitEnvelope(text), ({ body, meta }) =>
    Schema.decodeUnknownEffect(WalkthroughSection)({ ...meta, body })
  );
}

/** One record to validate: where it lives and how to decode its bytes. */
interface Task {
  decode: (text: string) => Effect.Effect<unknown, unknown>;
  file: string;
  rel: string;
}

/**
 * The most specific message an error carries. `Effect.try` wraps a thrown
 * `JSON.parse` / `Bun.YAML.parse` error under a generic message, so prefer the
 * wrapped `cause` when it holds the real one.
 */
function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  if (error.cause instanceof Error) {
    return error.cause.message;
  }
  return error.message;
}

/** A read / parse / decode failure as one grep-friendly report line — a
 * multi-line schema-decode tree collapses onto a single line. */
function formatError(error: unknown): string {
  return errorMessage(error).replaceAll(/\s+/g, " ").trim();
}

/** Read and decode one record; a `Problem` on any failure, else `undefined`. */
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

/** The validation tasks under one walkthrough kind (`code`/`product`). */
const walkthroughTasks = Effect.fn("walkthroughTasks")(
  function* walkthroughTasks(
    reviewDir: string,
    kind: (typeof WALKTHROUGH_KINDS)[number],
    toTask: (file: string, decode: Task["decode"]) => Task
  ) {
    const path = yield* Path;
    const kindDir = path.join(reviewDir, "walkthroughs", kind);
    const ids = (yield* listDir(kindDir)).filter((name) =>
      name.startsWith("wlk_")
    );
    const tasks: Task[] = [];
    for (const id of ids) {
      const walkthroughDir = path.join(kindDir, id);

      const manifest = path.join(walkthroughDir, "manifest.json");
      if (yield* exists(manifest)) {
        tasks.push(toTask(manifest, decodeJson(Walkthrough)));
      }

      const sections = (yield* listDir(walkthroughDir)).filter((name) =>
        name.endsWith(".md")
      );
      for (const section of sections) {
        tasks.push(toTask(path.join(walkthroughDir, section), decodeSection));
      }
    }
    return tasks;
  }
);

/** Every validation task under one Review directory, in tree order. */
const reviewTasks = Effect.fn("reviewTasks")(function* reviewTasks(
  stateRoot: string,
  slug: string
) {
  const path = yield* Path;
  const reviewDir = path.join(stateRoot, "reviews", slug);

  // Bind each task to its path relative to the state root, so a report reads the
  // same wherever the tree lives on disk (a scratch dir, a repo, a fixture).
  function toTask(file: string, decode: Task["decode"]): Task {
    return { decode, file, rel: path.relative(stateRoot, file) };
  }

  const tasks: Task[] = [];

  const reviewJson = path.join(reviewDir, "review.json");
  if (yield* exists(reviewJson)) {
    tasks.push(toTask(reviewJson, decodeJson(Review)));
  }

  for (const [sub, schema] of [
    ["changes", ChangeRecord],
    ["viewed", ViewedEvent],
  ] as const) {
    const dir = path.join(reviewDir, sub);
    const names = (yield* listDir(dir)).filter((name) =>
      name.endsWith(".json")
    );
    for (const name of names) {
      tasks.push(toTask(path.join(dir, name), decodeJson(schema)));
    }
  }

  const findingsDir = path.join(reviewDir, "findings");
  const findingIds = (yield* listDir(findingsDir)).filter((name) =>
    name.startsWith("fnd_")
  );
  for (const id of findingIds) {
    const findingDir = path.join(findingsDir, id);
    const records = (yield* listDir(findingDir)).filter((name) =>
      name.endsWith(".md")
    );
    for (const name of records) {
      tasks.push(toTask(path.join(findingDir, name), decodeFinding(name)));
    }
  }

  for (const kind of WALKTHROUGH_KINDS) {
    tasks.push(...(yield* walkthroughTasks(reviewDir, kind, toTask)));
  }

  return tasks;
});

/**
 * Walk a `.docent/` state root and decode every record against the `shared/`
 * schemas, returning a report of the failures. All reviews under `reviews/` are
 * validated (validate is branch-agnostic — it needs no git). The walk succeeds
 * even on an empty or absent tree: `checked` is then `0` and `problems` empty.
 */
export const validateStateRoot = Effect.fn("validateStateRoot")(
  function* validateStateRoot(stateRoot: string) {
    const path = yield* Path;
    const slugs = yield* listDir(path.join(stateRoot, "reviews"));
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
