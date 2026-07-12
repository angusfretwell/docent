/**
 * ULID-shaped opaque id minting for `.docent/` records: `<prefix>_` plus a
 * lexically sortable Crockford base32 tail, so ids mint in append order — the
 * same order the append-only `viewed/`/finding record directories read back
 * (data-model.md §4–5).
 */

import { Clock, Effect } from "effect";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A ULID-shaped opaque id under `prefix`: `<prefix>_` + 10 time chars + 16
 * random chars, Crockford base32. The time head keeps ids lexically sortable by
 * mint order — which is also the append-only `viewed/` file order.
 */
export const makeId = Effect.fn("makeId")(function* makeId(prefix: string) {
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
  return `${prefix}_${head}${tail}`;
});
