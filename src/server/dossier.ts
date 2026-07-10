/**
 * The Dossier store: the read path over `.docent/`. Resolves (auto-creating on
 * first use) the Dossier for a branch and walks its append-only record
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
  Dossier,
  DossierSnapshot,
  FindingEntry,
  ViewedEvent,
  WalkthroughEntry,
} from "../shared/dossier.ts";

const STATE_ROOT = ".docent";
const GITIGNORE_ENTRY = `${STATE_ROOT}/`;

/** Directory name for a branch's Dossier: the branch name, slashes → dashes. */
export function branchSlug(branch: string): string {
  return branch.replaceAll("/", "-");
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A ULID-shaped opaque id: 10 time chars + 16 random chars, Crockford base32. */
const makeDossierId = Effect.fn("makeDossierId")(function* () {
  const now = yield* Clock.currentTimeMillis;
  let time = now;
  let head = "";
  for (let i = 0; i < 10; i++) {
    head = CROCKFORD.charAt(time % 32) + head;
    time = Math.floor(time / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let tail = "";
  for (let i = 0; i < bytes.length; i++) {
    tail += CROCKFORD.charAt((bytes[i] ?? 0) % 32);
  }
  return `dsr_${head}${tail}`;
});

/** Decode a JSON file against a schema; `None` on any read/parse/decode failure. */
const readRecord = <S extends Schema.Constraint>(file: string, schema: S) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const text = yield* fs.readFileString(file);
    const json = yield* Effect.try(() => JSON.parse(text));
    return yield* Schema.decodeUnknownEffect(schema)(json);
  }).pipe(Effect.option);

/** Unwrap the `Some` values of an Options array (best-effort walk survivors). */
const somes = <A>(options: ReadonlyArray<Option.Option<A>>): A[] =>
  options.filter(Option.isSome).map((option) => option.value);

/** List a directory's entries, or `[]` when it does not exist. */
const listDir = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    return yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
  });

/** Read `dossier.json`, creating it (auto-create on first use) when absent. */
const ensureDossier = Effect.fn("ensureDossier")(function* (params: {
  dossierDir: string;
  branch: string;
  base: string;
}) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  const file = path.join(params.dossierDir, "dossier.json");

  const existing = yield* readRecord(file, Dossier);
  if (Option.isSome(existing)) {
    return existing.value;
  }

  const id = yield* makeDossierId();
  const dossier = Dossier.make({
    schema: "docent/dossier@3",
    id,
    branch: params.branch,
    base: params.base,
  });
  yield* fs.makeDirectory(params.dossierDir, { recursive: true });
  yield* fs.writeFileString(file, `${JSON.stringify(dossier, null, 2)}\n`);
  return dossier;
});

const readChanges = (dossierDir: string) =>
  Effect.gen(function* () {
    const path = yield* Path;
    const dir = path.join(dossierDir, "changes");
    const names = (yield* listDir(dir))
      .filter((name) => name.endsWith(".json"))
      .sort();
    const records = yield* Effect.forEach(
      names,
      (name) => readRecord(path.join(dir, name), ChangeRecord),
      { concurrency: "unbounded" },
    );
    return somes(records);
  });

const readViewed = (dossierDir: string) =>
  Effect.gen(function* () {
    const path = yield* Path;
    const dir = path.join(dossierDir, "viewed");
    const names = (yield* listDir(dir))
      .filter((name) => name.endsWith(".json"))
      .sort();
    const records = yield* Effect.forEach(
      names,
      (name) => readRecord(path.join(dir, name), ViewedEvent),
      { concurrency: "unbounded" },
    );
    return somes(records);
  });

const readFindings = (dossierDir: string) =>
  Effect.gen(function* () {
    const path = yield* Path;
    const dir = path.join(dossierDir, "findings");
    const ids = (yield* listDir(dir))
      .filter((name) => name.startsWith("fnd_"))
      .sort();
    return yield* Effect.forEach(
      ids,
      (id) =>
        Effect.gen(function* () {
          const records = (yield* listDir(path.join(dir, id)))
            .filter((name) => name.endsWith(".md"))
            .sort();
          return FindingEntry.make({ id, records });
        }),
      { concurrency: "unbounded" },
    );
  });

const readWalkthroughs = (dossierDir: string) =>
  Effect.gen(function* () {
    const path = yield* Path;
    const root = path.join(dossierDir, "walkthroughs");
    const entries = yield* Effect.forEach(
      ["code", "product"] as const,
      (kind) =>
        Effect.gen(function* () {
          const dir = path.join(root, kind);
          const ids = (yield* listDir(dir))
            .filter((name) => name.startsWith("wlk_"))
            .sort();
          return yield* Effect.forEach(
            ids,
            (id) =>
              Effect.gen(function* () {
                const files = (yield* listDir(path.join(dir, id))).sort();
                return WalkthroughEntry.make({ kind, id, files });
              }),
            { concurrency: "unbounded" },
          );
        }),
      { concurrency: "unbounded" },
    );
    return entries.flat();
  });

/**
 * Resolve the Dossier for `branch` under `root` (auto-creating it on first use)
 * and walk its records into a snapshot. Uncached: the caller re-reads on every
 * request, and the client re-fetches on every SSE change event.
 */
export const readDossierSnapshot = Effect.fn("readDossierSnapshot")(
  function* (params: { root: string; branch: string; base: string }) {
    const path = yield* Path;
    const dossierDir = path.join(
      params.root,
      STATE_ROOT,
      "dossiers",
      branchSlug(params.branch),
    );

    const dossier = yield* ensureDossier({
      dossierDir,
      branch: params.branch,
      base: params.base,
    });
    const [changes, findings, walkthroughs, viewed] = yield* Effect.all(
      [
        readChanges(dossierDir),
        readFindings(dossierDir),
        readWalkthroughs(dossierDir),
        readViewed(dossierDir),
      ],
      { concurrency: "unbounded" },
    );

    return DossierSnapshot.make({
      dossier,
      changes,
      findings,
      walkthroughs,
      viewed,
    });
  },
);

/**
 * Ensure `.docent/` stays out of git history by adding it to the repo's
 * `.gitignore` (data-model.md §1: in-repo but gitignored). Idempotent and
 * best-effort — a missing or unwritable `.gitignore` is not fatal.
 */
export const ensureGitignore = Effect.fn("ensureGitignore")(function* (
  root: string,
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  const file = path.join(root, ".gitignore");

  const current = yield* fs
    .readFileString(file)
    .pipe(Effect.orElseSucceed(() => ""));
  const ignored = current
    .split("\n")
    .some((line) => line.trim().replace(/\/$/, "") === STATE_ROOT);
  if (ignored) {
    return;
  }

  const prefix =
    current === "" || current.endsWith("\n") ? current : `${current}\n`;
  yield* fs.writeFileString(file, `${prefix}${GITIGNORE_ENTRY}\n`);
});
