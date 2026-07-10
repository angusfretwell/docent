import { describe, expect, test } from "bun:test";
import { processPatch } from "@pierre/diffs";
import {
  blobUrl,
  expandedFileDiff,
  isExpandable,
  isPendingExpandable,
  worktreeUrl,
} from "./blobs.ts";

// A git diff of a file with only its first line changed. The unchanged context
// lines 2–5 are trimmed by git's default 3-line context on such a small file,
// but a real patch of a larger file leaves surrounding lines out — that gap is
// what expansion fills. Here the point is only that the parsed diff is partial.
const PATCH = `diff --git a/a.txt b/a.txt
index 1111111..2222222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,1 +1,1 @@
-old line 3
+new line 3
`;

function firstFile() {
  const [file] = processPatch(PATCH).files;
  if (file === undefined) {
    throw new Error("expected a parsed file");
  }
  return file;
}

describe("blobUrl", () => {
  test("addresses the content-addressed blob endpoint by object id", () => {
    expect(blobUrl("abc123")).toBe("/api/blob/abc123");
  });
});

describe("isExpandable", () => {
  test("a patch-only modified file with both blob ids is expandable", () => {
    expect(isExpandable(firstFile())).toBe(true);
  });

  test("a full (non-partial) diff is not expandable — it already has context", () => {
    const full = expandedFileDiff(firstFile(), "a\nb\nc\n", "a\nB\nc\n");
    expect(full.isPartial).toBe(false);
    expect(isExpandable(full)).toBe(false);
  });

  test("a file missing a blob id (e.g. a pure add) is not expandable", () => {
    const withoutBase = { ...firstFile() };
    delete withoutBase.prevObjectId;
    expect(isExpandable(withoutBase)).toBe(false);
  });
});

describe("worktreeUrl", () => {
  test("addresses the uncached working-tree endpoint by path, encoded", () => {
    expect(worktreeUrl("src/app.ts")).toBe("/api/worktree?path=src%2Fapp.ts");
  });
});

describe("isPendingExpandable", () => {
  test("a patch-only modified file with real base and head ids is expandable", () => {
    expect(isPendingExpandable(firstFile())).toBe(true);
  });

  test("an untracked add (all-zero base id) is not expandable — no base to expand around", () => {
    const add = { ...firstFile(), prevObjectId: "0000000" };
    expect(isPendingExpandable(add)).toBe(false);
  });

  test("a deletion (all-zero head id) is not expandable — no working-tree file", () => {
    const del = { ...firstFile(), newObjectId: "0000000" };
    expect(isPendingExpandable(del)).toBe(false);
  });
});

describe("expandedFileDiff", () => {
  test("builds a non-partial diff whose lines are the whole file, enabling expansion", () => {
    const base = "line1\nline2\nold line 3\nline4\nline5\n";
    const head = "line1\nline2\nnew line 3\nline4\nline5\n";

    const full = expandedFileDiff(firstFile(), base, head);

    expect(full.isPartial).toBe(false);
    // deletionLines / additionLines now hold the complete file, not just the
    // patch window — that is what backs hunk and whole-file context expansion.
    expect(full.deletionLines).toEqual([
      "line1\n",
      "line2\n",
      "old line 3\n",
      "line4\n",
      "line5\n",
    ]);
    expect(full.additionLines).toEqual([
      "line1\n",
      "line2\n",
      "new line 3\n",
      "line4\n",
      "line5\n",
    ]);
  });
});
