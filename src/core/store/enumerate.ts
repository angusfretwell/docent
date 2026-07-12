/**
 * The `.docent/` record enumerator: which record types live where under a
 * Review directory, and how to decode each. Envelope-based records (a
 * Finding record, a walkthrough section — frontmatter over a markdown body)
 * get their decoder paired with their schema exactly once here; JSON records
 * pair with their schema via `store/io.ts`'s `decodeJsonRecord`/`readRecord`.
 *
 * Both the best-effort snapshot reader (`services/review.ts`) and the strict
 * schema oracle (`services/validate.ts`) walk the same directory shape
 * through these listers and decoders. Only how a decode failure is handled
 * differs — skipped versus reported — never which files are visited or what
 * decodes them (architecture.md §3, testing.md). Each envelope decoder has
 * two entry points sharing one decode: the raw `decode*` fails on any
 * problem (the strict entry point validate consumes directly), and the
 * `read*` wrapper reads the file and folds that failure into `None` (the
 * best-effort entry point the snapshot reader consumes).
 */

import { FindingRecord } from "@shared/schemas/finding";
import { WalkthroughSection } from "@shared/schemas/walkthrough";
import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";

import { listDir } from "./io";
import { recordType, splitEnvelope } from "./records";

/** The two walkthrough kinds a Review tracks (walkthroughs.md §4). */
export const WALKTHROUGH_KINDS = ["code", "product"] as const;
export type WalkthroughKind = (typeof WALKTHROUGH_KINDS)[number];

function endingWith(names: readonly string[], suffix: string): string[] {
  return names.filter((name) => name.endsWith(suffix)).toSorted();
}

function startingWith(names: readonly string[], prefix: string): string[] {
  return names.filter((name) => name.startsWith(prefix)).toSorted();
}

/** Sorted `*.json` file names directly in `dir`, or `[]` when it does not exist. */
export const listJsonRecordNames = Effect.fn("listJsonRecordNames")(
  function* listJsonRecordNames(dir: string) {
    return endingWith(yield* listDir(dir), ".json");
  }
);

/** Sorted `*.md` file names directly in `dir`, or `[]` when it does not exist. */
export const listMarkdownRecordNames = Effect.fn("listMarkdownRecordNames")(
  function* listMarkdownRecordNames(dir: string) {
    return endingWith(yield* listDir(dir), ".md");
  }
);

/** Sorted Finding directory names (`fnd_*`) directly in `dir`. */
export const listFindingIds = Effect.fn("listFindingIds")(
  function* listFindingIds(dir: string) {
    return startingWith(yield* listDir(dir), "fnd_");
  }
);

/** Sorted walkthrough directory names (`wlk_*`) directly in `dir`. */
export const listWalkthroughIds = Effect.fn("listWalkthroughIds")(
  function* listWalkthroughIds(dir: string) {
    return startingWith(yield* listDir(dir), "wlk_");
  }
);

/**
 * Decode one `NNN-<type>.md` Finding record's already-read text: split the
 * envelope, then decode against `FindingRecord` with the name and its
 * name-derived `type` folded in. Fails on any split/decode problem — the
 * strict entry point `docent validate` consumes directly.
 */
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

/** Read and decode one Finding record; `None` on any read/parse/decode failure. */
export const readFindingRecord = Effect.fn("readFindingRecord")(
  function* readFindingRecord(file: string, name: string) {
    const fs = yield* FileSystem;
    const text = yield* fs.readFileString(file);
    return yield* decodeFindingRecord(text, name);
  },
  Effect.option
);

/**
 * Decode one walkthrough section file's already-read text: split the
 * envelope, then decode against `WalkthroughSection`. Fails on any
 * split/decode problem — the strict entry point `docent validate` consumes
 * directly.
 */
export function decodeWalkthroughSection(text: string) {
  return Effect.flatMap(splitEnvelope(text), ({ body, meta }) =>
    Schema.decodeUnknownEffect(WalkthroughSection)({ ...meta, body })
  );
}

/** Read and decode one walkthrough section; `None` on any read/parse/decode failure. */
export const readWalkthroughSection = Effect.fn("readWalkthroughSection")(
  function* readWalkthroughSection(file: string) {
    const fs = yield* FileSystem;
    const text = yield* fs.readFileString(file);
    return yield* decodeWalkthroughSection(text);
  },
  Effect.option
);
