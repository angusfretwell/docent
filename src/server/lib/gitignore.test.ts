import { describe, expect, test } from "bun:test";

import { makeMatcher, parseGitignore } from "./gitignore";

describe("parseGitignore", () => {
  test("drops blanks, comments, and (unsupported) negations", () => {
    const patterns = parseGitignore(
      [
        "# a comment",
        "",
        "node_modules/",
        "  dist  ",
        "!keep.log",
        "*.log",
      ].join("\n")
    );

    expect(patterns).toEqual(["node_modules/", "dist", "*.log"]);
  });
});

describe("makeMatcher", () => {
  test("ignores a directory pattern and everything under it", () => {
    const matcher = makeMatcher(["node_modules/"]);

    expect(matcher.ignores("node_modules")).toBe(true);
    expect(matcher.ignores("node_modules/react/index.js")).toBe(true);
    expect(matcher.ignores("packages/app/node_modules/x.js")).toBe(true);
    expect(matcher.ignores("src/app.ts")).toBe(false);
  });

  test("matches a bare name in any directory", () => {
    const matcher = makeMatcher([".DS_Store"]);

    expect(matcher.ignores(".DS_Store")).toBe(true);
    expect(matcher.ignores("src/.DS_Store")).toBe(true);
    expect(matcher.ignores("src/app.ts")).toBe(false);
  });

  test("matches a suffix glob", () => {
    const matcher = makeMatcher(["*.log"]);

    expect(matcher.ignores("debug.log")).toBe(true);
    expect(matcher.ignores("logs/debug.log")).toBe(true);
    expect(matcher.ignores("debug.txt")).toBe(false);
  });

  test("anchors a leading-slash pattern to the root", () => {
    const matcher = makeMatcher(["/dist"]);

    expect(matcher.ignores("dist")).toBe(true);
    expect(matcher.ignores("dist/bundle.js")).toBe(true);
    // Not anchored at a nested level.
    expect(matcher.ignores("src/dist/x.js")).toBe(false);
  });

  test("anchors a pattern that contains a slash", () => {
    const matcher = makeMatcher(["docs/generated/"]);

    expect(matcher.ignores("docs/generated/api.md")).toBe(true);
    expect(matcher.ignores("docs/hand-written.md")).toBe(false);
  });

  test("always ignores the .git directory", () => {
    const matcher = makeMatcher([]);

    expect(matcher.ignores(".git")).toBe(true);
    expect(matcher.ignores(".git/index")).toBe(true);
    expect(matcher.ignores("src/app.ts")).toBe(false);
  });

  test("treats OS-native backslash separators as path separators", () => {
    const matcher = makeMatcher(["node_modules/"]);

    expect(matcher.ignores("node_modules\\react\\index.js")).toBe(true);
  });
});
