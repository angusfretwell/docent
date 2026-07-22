import { describe, expect, test } from "bun:test";

import { formatBytes, isRealObjectId, parsePatchBlocks } from "./patch";

describe("isRealObjectId", () => {
  test("a real object id names content; a null (all-zero) id or undefined does not", () => {
    expect(isRealObjectId("8553878")).toBe(true);
    expect(isRealObjectId("0".repeat(40))).toBe(false);
    expect(isRealObjectId()).toBe(false);
  });
});

describe("parsePatchBlocks", () => {
  const BINARY = `diff --git a/data.bin b/data.bin
index 8553878..4d72901 100644
Binary files a/data.bin and b/data.bin differ
`;
  const MODE_ONLY = `diff --git a/perm.txt b/perm.txt
old mode 100644
new mode 100755
`;
  const NORMAL = `diff --git a/text.txt b/text.txt
index de98044..a7bc997 100644
--- a/text.txt
+++ b/text.txt
@@ -1,3 +1,4 @@
 a
-b
+B
 c
+d
`;

  test("splits a multi-file patch into per-file blocks in order", () => {
    const blocks = parsePatchBlocks(BINARY + MODE_ONLY + NORMAL);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toContain("data.bin");
    expect(blocks[1]).toContain("perm.txt");
    expect(blocks[2]).toContain("text.txt");
  });

  test("does not split on a content line that begins with diff --git", () => {
    const patch = `diff --git a/a.txt b/a.txt
index 1..2 100644
--- a/a.txt
+++ b/a.txt
@@ -0,0 +1 @@
+diff --git a/x b/x
`;
    expect(parsePatchBlocks(patch)).toHaveLength(1);
  });

  test("empty patch yields no blocks", () => {
    expect(parsePatchBlocks("")).toHaveLength(0);
  });
});

describe("formatBytes", () => {
  test.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [1_048_576, "1 MB"],
    [2_411_724, "2.3 MB"],
    [1_073_741_824, "1 GB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
