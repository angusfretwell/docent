import { describe, expect, test } from "bun:test";

import { Effect } from "effect";

import { makeId } from "./id";

describe("makeId", () => {
  test("mints a <prefix>_ id with a 26-char Crockford base32 tail", async () => {
    const id = await Effect.runPromise(makeId("fnd"));

    expect(id).toMatch(/^fnd_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  test("two ids minted back-to-back are unique", async () => {
    const [first, second] = await Effect.runPromise(
      Effect.all([makeId("wlk"), makeId("wlk")])
    );

    expect(first).not.toBe(second);
  });
});
