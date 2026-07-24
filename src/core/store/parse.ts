/**
 * Tagged rather than generic errors: the schema oracle (`core/validate.ts`)
 * matches on the failure channel to render a record's problem line.
 */

import { Effect, Schema } from "effect";

export class JsonParseFailed extends Schema.TaggedErrorClass<JsonParseFailed>()(
  "JsonParseFailed",
  { reason: Schema.String }
) {
  override get message(): string {
    return this.reason;
  }
}

export class YamlParseFailed extends Schema.TaggedErrorClass<YamlParseFailed>()(
  "YamlParseFailed",
  { reason: Schema.String }
) {
  override get message(): string {
    return this.reason;
  }
}

function thrownMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

export function parseJson(text: string) {
  return Effect.try({
    catch: (thrown) => JsonParseFailed.make({ reason: thrownMessage(thrown) }),
    try: (): unknown => JSON.parse(text),
  });
}

export function parseYaml(text: string) {
  return Effect.try({
    catch: (thrown) => YamlParseFailed.make({ reason: thrownMessage(thrown) }),
    try: () => Bun.YAML.parse(text),
  });
}
