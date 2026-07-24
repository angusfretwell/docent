import type { Anchor, Author } from "@shared/schemas/finding";
import type { FindingWrite } from "@shared/schemas/finding-write";
import { FindingId } from "@shared/schemas/ids";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { makeId } from "./store/id";
import { listDir } from "./store/io";
import { recordFile, serializeFrontmatter } from "./store/records";
import type { ChangeRefs } from "./write-context";
import { maxSequence, now, resolveWriteContext } from "./write-context";

function frontmatter(fields: {
  author: Author;
  changeId: string;
  createdAt: string;
  anchor?: Anchor;
  edits?: string;
}): string {
  const author = {
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

export const writeFindingRecord = Effect.fn("writeFindingRecord")(
  function* writeFindingRecord(params: {
    root: string;
    branch: string;
    base: string;
    refs: ChangeRefs;
    author: Author;
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

    const findingId =
      write.op === "open" ? yield* makeId(FindingId, "fnd") : write.findingId;
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
    const body = "body" in write ? write.body : "";

    yield* fs.makeDirectory(findingDir, { recursive: true });
    yield* fs.writeFileString(
      path.join(findingDir, recordName),
      recordFile(frontmatter(meta), body)
    );

    return { changeId: change.id, findingId, record: recordName };
  }
);
