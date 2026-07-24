/**
 * Each envelope decoder has two entry points sharing one decode: the raw
 * `decode*` fails on any problem (the strict entry point `validate` consumes),
 * and the `read*` wrapper folds that failure into `None` (the best-effort entry
 * point the snapshot reader consumes).
 */

import { FindingRecord } from "@shared/schemas/finding";
import { WalkthroughSection } from "@shared/schemas/walkthrough";
import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";

import { listDir } from "./io";
import { recordType, splitEnvelope } from "./records";

function endingWith(names: readonly string[], suffix: string): string[] {
  return names.filter((name) => name.endsWith(suffix)).toSorted();
}

function startingWith(names: readonly string[], prefix: string): string[] {
  return names.filter((name) => name.startsWith(prefix)).toSorted();
}

export const listJsonRecordNames = Effect.fn("listJsonRecordNames")(
  function* listJsonRecordNames(dir: string) {
    return endingWith(yield* listDir(dir), ".json");
  }
);

export const listMarkdownRecordNames = Effect.fn("listMarkdownRecordNames")(
  function* listMarkdownRecordNames(dir: string) {
    return endingWith(yield* listDir(dir), ".md");
  }
);

export const listFindingIds = Effect.fn("listFindingIds")(
  function* listFindingIds(dir: string) {
    return startingWith(yield* listDir(dir), "fnd_");
  }
);

export const listWalkthroughIds = Effect.fn("listWalkthroughIds")(
  function* listWalkthroughIds(dir: string) {
    return startingWith(yield* listDir(dir), "wlk_");
  }
);

export function decodeFindingRecord(text: string, name: string) {
  return Effect.flatMap(splitEnvelope(text), ({ body, meta }) =>
    Schema.decodeUnknownEffect(FindingRecord)({
      ...meta,
      body,
      name,
      type: recordType(name),
    })
  );
}

export const readFindingRecord = Effect.fn("readFindingRecord")(
  function* readFindingRecord(file: string, name: string) {
    const fs = yield* FileSystem;
    const text = yield* fs.readFileString(file);
    return yield* decodeFindingRecord(text, name);
  },
  Effect.option
);

export function decodeWalkthroughSection(text: string) {
  return Effect.flatMap(splitEnvelope(text), ({ body, meta }) =>
    Schema.decodeUnknownEffect(WalkthroughSection)({ ...meta, body })
  );
}

export const readWalkthroughSection = Effect.fn("readWalkthroughSection")(
  function* readWalkthroughSection(file: string) {
    const fs = yield* FileSystem;
    const text = yield* fs.readFileString(file);
    return yield* decodeWalkthroughSection(text);
  },
  Effect.option
);
