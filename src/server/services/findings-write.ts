/**
 * The Finding write path over `.docent/`: lazy Change minting and append-only
 * record drops. The mirror of `review.ts`'s read path — every write here lands
 * a file the read walk parses back, in the identical shape an agent writes
 * directly (data-model.md §4–5, architecture.md §2).
 *
 * Writing any record is a minting reference: the Change for the live head mints
 * lazily and idempotently by `(baseSha, headSha)`, and every record stamps the
 * `changeId` current at write. No locks, no read-modify-write — a mutation is a
 * new file, never a rewrite.
 */

import type { Anchor, Disposition } from "@shared/schemas/finding";
import type { FindingWrite } from "@shared/schemas/finding-write";
import { ChangeRecord } from "@shared/schemas/review";
import { Clock, Effect, Option } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { makeId } from "../store/id";
import { listDir, readRecord } from "../store/io";
import { reviewDirPath } from "../store/layout";
import { recordFile, serializeFrontmatter } from "../store/records";
import { ensureReview } from "./review";

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

const now = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => new Date(millis).toISOString())
);

/** The highest `NNN` numeric prefix across `NNN-…`/`chg_NNN` names, or 0. */
function maxSequence(names: readonly string[], pattern: RegExp): number {
  let max = 0;
  for (const name of names) {
    const value = pattern.exec(name)?.groups?.n;
    if (value !== undefined) {
      max = Math.max(max, Number(value));
    }
  }
  return max;
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

  const id = `chg_${String(maxSequence(names, /^chg_(?<n>\d+)\.json$/) + 1).padStart(3, "0")}`;
  const record = ChangeRecord.make({
    baseRef: params.refs.baseRef,
    baseSha: params.refs.baseSha,
    capturedAt: yield* now,
    headRef: params.refs.headRef,
    headSha: params.refs.headSha,
    id,
    schema: "docent/change@3",
  });
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* fs.writeFileString(
    path.join(dir, `${id}.json`),
    `${JSON.stringify(record, null, 2)}\n`
  );
  return record;
});

/**
 * Serialize a record's frontmatter envelope: block-style top-level keys with
 * flow-style nested objects — the greppable shape the read path parses back
 * (data-model.md §5.2). Absent optional fields are dropped, and key order is the
 * insertion order below.
 */
function frontmatter(fields: {
  author: AuthorInput;
  changeId: string;
  createdAt: string;
  anchor?: Anchor;
  disposition?: Disposition;
  edits?: string;
}): string {
  const author: AuthorInput = {
    display: fields.author.display,
    id: fields.author.id,
    kind: fields.author.kind,
    ...(fields.author.model === undefined
      ? {}
      : { model: fields.author.model }),
  };
  const ordered: [string, unknown][] = [
    ["schema", "docent/finding@3"],
    ["author", author],
    ["changeId", fields.changeId],
    ["createdAt", fields.createdAt],
    ["anchor", fields.anchor],
    ["disposition", fields.disposition],
    ["edits", fields.edits],
  ];
  return serializeFrontmatter(ordered);
}

/**
 * Append one Finding record — the five append-only ops: `open` (mints a new
 * `fnd_*` dir with the anchored root record), `reply` (optionally dispositioned),
 * `resolve` (optional reason body), `reopen`, and `edit` (supersedes a named
 * record's body). Every record mints-or-reuses the live head's Change and stamps
 * its `changeId`; the root record's is the Finding's born Change (data-model.md
 * §5.1–5.2, §7).
 */
export const writeFindingRecord = Effect.fn("writeFindingRecord")(
  function* writeFindingRecord(params: {
    root: string;
    branch: string;
    base: string;
    refs: ChangeRefs;
    author: AuthorInput;
    write: FindingWrite;
  }) {
    const fs = yield* FileSystem;
    const path = yield* Path;

    const reviewDir = reviewDirPath(params.root, params.branch);
    yield* ensureReview({
      base: params.base,
      branch: params.branch,
      reviewDir,
      root: params.root,
    });
    const change = yield* mintChange({ refs: params.refs, reviewDir });
    const createdAt = yield* now;

    const findingsDir = path.join(reviewDir, "findings");
    const { write } = params;

    // Resolve the target finding dir, record type, next filename, body, and the
    // op-specific frontmatter (anchor on open, disposition on reply, the edited
    // record's name on edit).
    const findingId =
      write.op === "open" ? yield* makeId("fnd") : write.findingId;
    const findingDir = path.join(findingsDir, findingId);
    const existing =
      write.op === "open"
        ? []
        : (yield* listDir(findingDir)).filter((name) => name.endsWith(".md"));
    const sequence = String(maxSequence(existing, /^(?<n>\d+)-/) + 1).padStart(
      3,
      "0"
    );
    const recordName = `${sequence}-${write.op}.md`;

    const meta: Parameters<typeof frontmatter>[0] = {
      author: params.author,
      changeId: change.id,
      createdAt,
      ...(write.op === "open" ? { anchor: write.anchor } : {}),
      ...(write.op === "reply" && write.disposition !== undefined
        ? { disposition: write.disposition }
        : {}),
      ...(write.op === "edit" ? { edits: write.edits } : {}),
    };
    // reopen carries no body; resolve's body is its optional reason.
    const body = write.op === "reopen" ? "" : (write.body ?? "");

    yield* fs.makeDirectory(findingDir, { recursive: true });
    yield* fs.writeFileString(
      path.join(findingDir, recordName),
      recordFile(frontmatter(meta), body)
    );

    return { changeId: change.id, findingId, record: recordName };
  }
);
