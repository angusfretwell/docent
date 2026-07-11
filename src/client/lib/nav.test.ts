import { describe, expect, test } from "bun:test";
import {
  buildTree,
  changeAnchors,
  filterEntries,
  flattenFiles,
  parseFiles,
  sortEntries,
  stepChange,
  stepFile,
} from "./nav";

/** A patch touching one file, with the given hunk of +adds/-dels. */
function filePatch(header: string, body: string, index = "index 0000000..1111111 100644"): string {
  return `diff --git ${header}\n${index}\n${body}`;
}

const MODIFY = filePatch(
  "a/src/app.ts b/src/app.ts",
  `--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 a
+b
 c
`,
);

const ADD = filePatch(
  "a/src/new.ts b/src/new.ts",
  `new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+one
+two
`,
  "index 0000000..2222222",
);

const DELETE = filePatch(
  "a/old.ts b/old.ts",
  `deleted file mode 100644
--- a/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-gone
-away
`,
  "index 3333333..0000000",
);

const RENAME = `diff --git a/src/a.ts b/src/b.ts
similarity index 100%
rename from src/a.ts
rename to src/b.ts
`;

describe("parseFiles", () => {
  test("maps change type to A/M/D/R and sums +/- counts", () => {
    const [add] = parseFiles(ADD);
    const [mod] = parseFiles(MODIFY);
    const [del] = parseFiles(DELETE);
    const [ren] = parseFiles(RENAME);

    expect(add).toMatchObject({
      additions: 2,
      changeType: "A",
      deletions: 0,
      path: "src/new.ts",
    });
    expect(mod).toMatchObject({ additions: 1, changeType: "M", deletions: 0 });
    expect(del).toMatchObject({ additions: 0, changeType: "D", deletions: 2 });
    expect(ren).toMatchObject({
      changeType: "R",
      path: "src/b.ts",
      prevPath: "src/a.ts",
    });
  });

  test("assigns an id stable to the file's patch position", () => {
    const files = parseFiles(ADD + MODIFY);
    expect(files.map((f) => f.id)).toEqual(["src/new.ts#0", "src/app.ts#1"]);
  });
});

describe("sortEntries", () => {
  const entries = parseFiles(MODIFY + ADD + DELETE);

  test("path order is alphabetical by full path", () => {
    expect(sortEntries(entries, "path").map((f) => f.path)).toEqual([
      "old.ts",
      "src/app.ts",
      "src/new.ts",
    ]);
  });

  test("size order is largest changed-line count first", () => {
    // del=2, add=2, mod=1
    expect(sortEntries(entries, "size").map((f) => f.path)).toEqual([
      "old.ts",
      "src/new.ts",
      "src/app.ts",
    ]);
  });
});

describe("buildTree", () => {
  test("nests files under directory nodes", () => {
    const tree = buildTree(sortEntries(parseFiles(MODIFY + ADD), "path"));
    expect(tree).toHaveLength(1);
    const [root] = tree;
    expect(root).toMatchObject({ kind: "dir", name: "src", path: "src" });
  });

  test("collapses single-child folder chains VS Code compact-folder style", () => {
    const deep = filePatch(
      "a/a/b/c/f.ts b/a/b/c/f.ts",
      `--- a/a/b/c/f.ts
+++ b/a/b/c/f.ts
@@ -1 +1,2 @@
 x
+y
`,
    );
    const tree = buildTree(parseFiles(deep));
    expect(tree[0]).toMatchObject({
      kind: "dir",
      name: "a/b/c",
      path: "a/b/c",
    });
  });

  test("flattening the tree agrees with the sorted scroll order", () => {
    const sorted = sortEntries(parseFiles(MODIFY + ADD + DELETE), "path");
    expect(flattenFiles(buildTree(sorted))).toEqual(sorted);
  });
});

describe("filterEntries", () => {
  const entries = parseFiles(MODIFY + ADD + DELETE);

  test("keeps entries whose path contains the substring, case-insensitively", () => {
    expect(filterEntries(entries, "APP").map((f) => f.path)).toEqual(["src/app.ts"]);
  });

  test("an empty query keeps everything", () => {
    expect(filterEntries(entries, "")).toEqual(entries);
  });
});

describe("jump primitives", () => {
  const ordered = sortEntries(parseFiles(MODIFY + ADD + DELETE), "path");

  test("next/prev file walks the ordered file list", () => {
    const ids = ordered.map((f) => f.id);
    const [first, second] = ids;
    expect(stepFile(ids, first, 1)).toBe(second as string);
    expect(stepFile(ids, second, -1)).toBe(first as string);
    expect(stepFile(ids, ids.at(-1), 1)).toBeUndefined();
  });

  test("next/prev change crosses file boundaries at the hunk level", () => {
    // A two-hunk file followed by a one-hunk file: 3 change anchors total.
    const twoHunk = filePatch(
      "a/m.ts b/m.ts",
      `--- a/m.ts
+++ b/m.ts
@@ -1,2 +1,3 @@
 a
+b
 c
@@ -10,2 +11,3 @@
 x
+z
 y
`,
    );
    const entries = sortEntries(parseFiles(twoHunk + ADD), "path");
    const [mFile, addFile] = entries;
    const anchors = changeAnchors(entries);
    expect(anchors).toHaveLength(3);
    // last hunk of m.ts → first hunk of src/new.ts (crosses the boundary)
    expect(anchors[1]).toMatchObject({ fileId: mFile?.id, hunkIndex: 1 });
    expect(stepChange(anchors.length, 1, 1)).toBe(2);
    expect(anchors[2]?.fileId).toBe(addFile?.id as string);
    expect(stepChange(anchors.length, 0, -1)).toBe(0);
  });
});
