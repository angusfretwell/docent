import { describe, expect, test } from "bun:test";

import { resolveBasepath } from "./basepath";

describe("resolveBasepath", () => {
  test("a mount is normalized to a leading slash with no trailing one", () => {
    expect(["/demo", "/demo/", "demo", "demo/"].map(resolveBasepath)).toEqual([
      "/demo",
      "/demo",
      "/demo",
      "/demo",
    ]);
  });

  test("a nested mount keeps its interior separators", () => {
    expect(resolveBasepath("/try/demo/")).toBe("/try/demo");
  });

  test("an absent mount is the root, which reads as empty rather than a slash", () => {
    expect([null, "", "/"].map(resolveBasepath)).toEqual(["", "", ""]);
  });
});
