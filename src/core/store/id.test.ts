import { describe, expect, test } from "bun:test";

import { CommentId, WalkthroughId } from "@shared/schemas/ids";
import { Effect } from "effect";

import { makeId } from "./id";

describe("makeId", () => {
  test("mints a <prefix>_ id with a 26-char Crockford base32 tail", async () => {
    const id = await Effect.runPromise(makeId(CommentId, "cmt"));

    expect(id).toMatch(/^cmt_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  test("two ids minted back-to-back are unique", async () => {
    const [first, second] = await Effect.runPromise(
      Effect.all([makeId(WalkthroughId, "wlk"), makeId(WalkthroughId, "wlk")])
    );

    expect(first).not.toBe(second);
  });

  test("a prefix the id schema does not admit fails the mint", async () => {
    const exit = await Effect.runPromiseExit(makeId(CommentId, "wlk"));

    expect(exit._tag).toBe("Failure");
  });
});
