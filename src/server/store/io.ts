/**
 * The `.docent/` filesystem read primitives shared by the read and write
 * paths: decode a JSON record against a schema, tolerating any read/parse/
 * decode failure as absence rather than a fatal error, and list a directory's
 * entries, tolerating a missing directory as empty (architecture.md §3 —
 * the filesystem is the interface, best-effort by design).
 */

import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";

/** Decode a JSON file against a schema; `None` on any read/parse/decode failure. */
export const readRecord = Effect.fn("readRecord")(function* readRecord<
  S extends Schema.Constraint,
>(file: string, schema: S) {
  const fs = yield* FileSystem;
  const text = yield* fs.readFileString(file);
  const json = yield* Effect.try(() => JSON.parse(text));
  return yield* Schema.decodeUnknownEffect(schema)(json);
}, Effect.option);

/** List a directory's entries, or `[]` when it does not exist. */
export const listDir = Effect.fn("listDir")(function* listDir(dir: string) {
  const fs = yield* FileSystem;
  return yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
});
