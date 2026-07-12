/**
 * The `.docent/` filesystem read/write primitives shared across the record
 * writers: decode a JSON record against a schema, tolerating any read/parse/
 * decode failure as absence rather than a fatal error; list a directory's
 * entries, tolerating a missing directory as empty (architecture.md §3 —
 * the filesystem is the interface, best-effort by design); and serialize a
 * record to its canonical on-disk bytes.
 *
 * `decodeJsonRecord` is the strict half `readRecord` wraps in `Effect.option`
 * — `docent validate`'s oracle (`services/validate.ts`) consumes it directly,
 * unwrapped, so a JSON record type is paired with its decoder exactly once
 * regardless of which caller's failure-handling it runs under.
 */

import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";

/** Decode already-read JSON text against `schema`; fails on any parse/decode problem. */
export function decodeJsonRecord<S extends Schema.Constraint>(
  text: string,
  schema: S
) {
  return Effect.flatMap(
    Effect.try(() => JSON.parse(text) as unknown),
    Schema.decodeUnknownEffect(schema)
  );
}

/** Decode a JSON file against a schema; `None` on any read/parse/decode failure. */
export const readRecord = Effect.fn("readRecord")(function* readRecord<
  S extends Schema.Constraint,
>(file: string, schema: S) {
  const fs = yield* FileSystem;
  const text = yield* fs.readFileString(file);
  return yield* decodeJsonRecord(text, schema);
}, Effect.option);

/** List a directory's entries, or `[]` when it does not exist. */
export const listDir = Effect.fn("listDir")(function* listDir(dir: string) {
  const fs = yield* FileSystem;
  return yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
});

/**
 * Write `value` as a JSON record at `file`: 2-space indent, trailing newline —
 * the canonical on-disk shape every `.docent/` record writer produces, and the
 * write counterpart of `readRecord`. Does not create parent directories; the
 * caller ensures those (each writer's own directory-creation policy differs).
 */
export const writeJsonRecord = Effect.fn("writeJsonRecord")(
  function* writeJsonRecord(file: string, value: unknown) {
    const fs = yield* FileSystem;
    yield* fs.writeFileString(file, `${JSON.stringify(value, null, 2)}\n`);
  }
);
