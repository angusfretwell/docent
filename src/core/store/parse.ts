/**
 * The raw-parser boundary for `.docent/` record bytes. `JSON.parse` and
 * `Bun.YAML.parse` both signal a malformed document by throwing, so each is
 * wrapped here into a tagged failure carrying the parser's own diagnostic —
 * the most specific thing a report can say about where the text went wrong.
 *
 * Tagged rather than generic because the schema oracle (`core/validate.ts`)
 * matches on its failure channel to render a record's problem line; a bare
 * `Error` there would leave it sniffing shapes at runtime.
 */

import { Effect, Schema } from "effect";

/** A record's bytes were not a JSON document. */
export class JsonParseFailed extends Schema.TaggedErrorClass<JsonParseFailed>()(
  "JsonParseFailed",
  { reason: Schema.String }
) {
  override get message(): string {
    return this.reason;
  }
}

/** A record's frontmatter block was not a YAML document. */
export class YamlParseFailed extends Schema.TaggedErrorClass<YamlParseFailed>()(
  "YamlParseFailed",
  { reason: Schema.String }
) {
  override get message(): string {
    return this.reason;
  }
}

/** A thrown value's own words — a parser's diagnostic names the offending token. */
function thrownMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/** Parse JSON text, failing with `JsonParseFailed` rather than throwing. */
export function parseJson(text: string) {
  return Effect.try({
    catch: (thrown) => JsonParseFailed.make({ reason: thrownMessage(thrown) }),
    try: (): unknown => JSON.parse(text),
  });
}

/** Parse YAML text, failing with `YamlParseFailed` rather than throwing. */
export function parseYaml(text: string) {
  return Effect.try({
    catch: (thrown) => YamlParseFailed.make({ reason: thrownMessage(thrown) }),
    try: () => Bun.YAML.parse(text),
  });
}
