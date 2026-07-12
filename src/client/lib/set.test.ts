import { describe, expect, test } from "bun:test";

import { toggleInSet } from "./set";

describe("toggleInSet", () => {
  test("adds a value absent from the set", () => {
    const result = toggleInSet(new Set(["a"]), "b");

    expect([...result]).toEqual(["a", "b"]);
  });

  test("removes a value already in the set", () => {
    const result = toggleInSet(new Set(["a", "b"]), "b");

    expect([...result]).toEqual(["a"]);
  });

  test("leaves the input set unmodified", () => {
    const input = new Set(["a"]);

    toggleInSet(input, "b");

    expect([...input]).toEqual(["a"]);
  });
});
