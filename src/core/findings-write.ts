/**
 * The Finding write path over `.docent/`: append-only record drops over the
 * shared write context. The mirror of `review.ts`'s read path — every write
 * here lands a file the read walk parses back, in the identical shape an agent
 * writes directly. The lazy Change minting each record stamps lives in
 * `write-context.ts`, shared with the walkthrough write path.
 */

import type { Anchor } from "@shared/schemas/finding";
import type { FindingWrite } from "@shared/schemas/finding-write";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { makeId } from "./store/id";
import { listDir } from "./store/io";
import { recordFile, serializeFrontmatter } from "./store/records";
import type { AuthorInput, ChangeRefs } from "./write-context";
import { maxSequence, now, resolveWriteContext } from "./write-context";

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
    ["schema", "docent/finding"],
    ["author", author],
    ["changeId", fields.changeId],
    ["createdAt", fields.createdAt],
    ["anchor", fields.anchor],
    ["edits", fields.edits],
  ];
  return serializeFrontmatter(ordered);
}

/**
 * Append one Finding record — the six append-only ops: `open` (mints a new
 * `fnd_*` dir with the anchored root record), `reply`, `action`, `resolve`,
 * `reopen`, and `edit` (supersedes a named record's body). Every record
 * mints-or-reuses the live head's Change and stamps its `changeId`; the root
 * record's is the Finding's born Change.
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

    const { change, reviewDir } = yield* resolveWriteContext({
      base: params.base,
      branch: params.branch,
      refs: params.refs,
      root: params.root,
    });
    const createdAt = yield* now;

    const findingsDir = path.join(reviewDir, "findings");
    const { write } = params;

    // Resolve the target finding dir, record type, next filename, body, and the
    // op-specific frontmatter (anchor on open, the edited record's name on edit).
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
      ...(write.op === "edit" ? { edits: write.edits } : {}),
    };
    // Only the prose ops carry a body; action/resolve/reopen move status alone.
    const body = "body" in write ? write.body : "";

    yield* fs.makeDirectory(findingDir, { recursive: true });
    yield* fs.writeFileString(
      path.join(findingDir, recordName),
      recordFile(frontmatter(meta), body)
    );

    return { changeId: change.id, findingId, record: recordName };
  }
);
