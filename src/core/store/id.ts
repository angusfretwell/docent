/**
 * Ids are lexically sortable (Crockford base32, time-headed) so they mint in
 * append order — the order the append-only record directories read back.
 */

import { Clock, Effect } from "effect";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

interface IdSchema<Id extends string> {
  readonly make: (input: string) => Id;
}

/**
 * The mint is keyed on the id's own schema, so a `prefix` that disagrees with
 * the schema's `<prefix>_` refinement is a construction error at the mint, not a
 * brand asserted over it.
 */
export const makeId = Effect.fn("makeId")(function* makeId<Id extends string>(
  schema: IdSchema<Id>,
  prefix: string
) {
  const now = yield* Clock.currentTimeMillis;
  let time = now;
  let head = "";
  for (let i = 0; i < 10; i += 1) {
    head = CROCKFORD.charAt(time % 32) + head;
    time = Math.floor(time / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let tail = "";
  for (const byte of bytes) {
    tail += CROCKFORD.charAt(byte % 32);
  }
  return schema.make(`${prefix}_${head}${tail}`);
});
