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
const makeDossierId = Effect.fn("makeDossierId")(function* makeDossierId() {
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
  return `dsr_${head}${tail}`;
});

/** Decode a JSON file against a schema; `None` on any read/parse/decode failure. */
const readRecord = Effect.fn("readRecord")(function* readRecord<S extends Schema.Constraint>(
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
const listDir = Effect.fn("listDir")(function* listDir(dir: string) {
  const fs = yield* FileSystem;
  return yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
});

/** Read `dossier.json`, creating it (auto-create on first use) when absent. */
const ensureDossier = Effect.fn("ensureDossier")(function* ensureDossier(params: {
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
    base: params.base,
    branch: params.branch,
    id,
    schema: "docent/dossier@3",
  });
  yield* fs.makeDirectory(params.dossierDir, { recursive: true });
  yield* fs.writeFileString(file, `${JSON.stringify(dossier, null, 2)}\n`);
  return dossier;
});

/** Decode every `*.json` in `<dossierDir>/<sub>`, skipping records that fail. */
const readJsonRecords = Effect.fn("readJsonRecords")(function* readJsonRecords<
  S extends Schema.Constraint,
>(dossierDir: string, sub: string, schema: S) {
  const path = yield* Path;
  const dir = path.join(dossierDir, sub);
  const names = (yield* listDir(dir)).filter((name) => name.endsWith(".json")).toSorted();
  const records = yield* Effect.forEach(names, (name) => readRecord(path.join(dir, name), schema), {
    concurrency: "unbounded",
  });
  return somes(records);
});

/** Walk one finding's directory into its record listing. */
const readFinding = Effect.fn("readFinding")(function* readFinding(dir: string, id: string) {
  const path = yield* Path;
  const records = (yield* listDir(path.join(dir, id)))
    .filter((name) => name.endsWith(".md"))
    .toSorted();
  return FindingEntry.make({ id, records });
});

const readFindings = Effect.fn("readFindings")(function* readFindings(dossierDir: string) {
  const path = yield* Path;
  const dir = path.join(dossierDir, "findings");
  const ids = (yield* listDir(dir)).filter((name) => name.startsWith("fnd_")).toSorted();
  return yield* Effect.forEach(ids, (id) => readFinding(dir, id), { concurrency: "unbounded" });
});

/** Walk one walkthrough's directory into its file listing. */
const readWalkthrough = Effect.fn("readWalkthrough")(function* readWalkthrough(
  dir: string,
  kind: "code" | "product",
  id: string,
) {
  const path = yield* Path;
  const files = (yield* listDir(path.join(dir, id))).toSorted();
  return WalkthroughEntry.make({ files, id, kind });
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
  dossierDir: string,
) {
  const path = yield* Path;
  const root = path.join(dossierDir, "walkthroughs");
  const entries = yield* Effect.forEach(
    ["code", "product"] as const,
    (kind) => readWalkthroughKind(root, kind),
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
  function* readDossierSnapshot(params: { root: string; branch: string; base: string }) {
    const path = yield* Path;
    const dossierDir = path.join(params.root, STATE_ROOT, "dossiers", branchSlug(params.branch));

    const dossier = yield* ensureDossier({
      base: params.base,
      branch: params.branch,
      dossierDir,
    });
    const [changes, findings, walkthroughs, viewed] = yield* Effect.all(
      [
        readJsonRecords(dossierDir, "changes", ChangeRecord),
        readFindings(dossierDir),
        readWalkthroughs(dossierDir),
        readJsonRecords(dossierDir, "viewed", ViewedEvent),
      ],
      { concurrency: "unbounded" },
    );

    return DossierSnapshot.make({
      changes,
      dossier,
      findings,
      viewed,
      walkthroughs,
    });
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
