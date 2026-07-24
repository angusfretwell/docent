/**
 * `decodeJsonRecord` is the strict half `readRecord` wraps in `Effect.option`,
 * so a JSON record type is paired with its decoder exactly once — `validate`
 * consumes the strict half directly, the snapshot reader the best-effort wrapper.
 */

import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";

import { parseJson } from "./parse";

export function decodeJsonRecord<S extends Schema.Constraint>(
  text: string,
  schema: S
) {
  return Effect.flatMap(parseJson(text), Schema.decodeUnknownEffect(schema));
}

export const readRecord = Effect.fn("readRecord")(function* readRecord<
  S extends Schema.Constraint,
>(file: string, schema: S) {
  const fs = yield* FileSystem;
  const text = yield* fs.readFileString(file);
  return yield* decodeJsonRecord(text, schema);
}, Effect.option);

export const listDir = Effect.fn("listDir")(function* listDir(dir: string) {
  const fs = yield* FileSystem;
  return yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
});

/**
 * Canonical shape: encoded through `schema` (the mirror of `readRecord`'s
 * decode), 2-space indent, trailing newline. Does not create parent directories
 * — the caller ensures those.
 */
export const writeJsonRecord = Effect.fn("writeJsonRecord")(
  function* writeJsonRecord<S extends Schema.Constraint>(
    file: string,
    schema: S,
    value: S["Type"]
  ) {
    const fs = yield* FileSystem;
    const encoded = yield* Schema.encodeEffect(schema)(value);
    yield* fs.writeFileString(file, `${JSON.stringify(encoded, null, 2)}\n`);
  }
);
