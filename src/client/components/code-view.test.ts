import { describe, expect, test } from "bun:test";

import { parsePatchFiles } from "@client/lib/diff";

import { useDiffItems } from "./code-view";

const patch = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index aaaa111..bbbb222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,1 +1,1 @@",
  "-old",
  "+new",
  "diff --git a/src/b.ts b/src/b.ts",
  "index cccc333..dddd444 100644",
  "--- a/src/b.ts",
  "+++ b/src/b.ts",
  "@@ -1,1 +1,1 @@",
  "-old",
  "+new",
  "",
].join("\n");

describe("useDiffItems", () => {
  test("builds one item per file", () => {
    const files = parsePatchFiles(patch);

    const items = useDiffItems({ composing: null, files, findings: [] });

    expect(items.map((item) => item.id)).toEqual(files.map((file) => file.id));
  });

  test("leaves every file expanded when no collapse predicate is given", () => {
    const files = parsePatchFiles(patch);

    const items = useDiffItems({ composing: null, files, findings: [] });

    expect(items.every((item) => item.collapsed === false)).toBe(true);
  });

  test("collapses only the files the predicate marks", () => {
    const files = parsePatchFiles(patch);
    const collapsedId = files[0]?.id;

    const items = useDiffItems({
      composing: null,
      files,
      findings: [],
      isCollapsed: (itemId) => itemId === collapsedId,
    });

    expect(items.find((item) => item.id === collapsedId)?.collapsed).toBe(true);
    expect(items.find((item) => item.id !== collapsedId)?.collapsed).toBe(
      false
    );
  });
});
