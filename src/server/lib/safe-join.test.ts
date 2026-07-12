import { describe, expect, test } from "bun:test";

import { isContained, safeJoin } from "./safe-join";

describe("safeJoin", () => {
  test("joins segments that stay under the root", () => {
    expect(safeJoin("/repo", "src", "app.ts")).toBe("/repo/src/app.ts");
  });

  test("normalizes an internal .. that never walks past the root", () => {
    expect(safeJoin("/repo", "src/../src/app.ts")).toBe("/repo/src/app.ts");
  });

  test("rejects a relative path that escapes the root", () => {
    expect(safeJoin("/repo", "../../etc/passwd")).toBeNull();
  });

  test("rejects an absolute segment outright", () => {
    expect(safeJoin("/repo", "/etc/passwd")).toBeNull();
  });

  test("rejects an absolute segment even when it names a path under the root", () => {
    expect(safeJoin("/repo", "/repo/src/app.ts")).toBeNull();
  });
});

describe("isContained", () => {
  test("is true for a path nested under the root", () => {
    expect(isContained("/repo", "/repo/src/app.ts")).toBe(true);
  });

  test("is false for a path outside the root", () => {
    expect(isContained("/repo", "/etc/passwd")).toBe(false);
  });

  test("is false for a same-named sibling directory", () => {
    expect(isContained("/repo", "/repo-other/app.ts")).toBe(false);
  });
});
