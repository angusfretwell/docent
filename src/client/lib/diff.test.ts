import { describe, expect, test } from "bun:test";

import {
  diffItemVersion,
  expansionBlobs,
  parsePatchFiles,
  withBlobContents,
} from "./diff";

const base = "one\ntwo\nold\nfour\n";
const head = "one\ntwo\nnew\nfour\n";

const patch = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index aaaa111..bbbb222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -3,1 +3,1 @@",
  "-old",
  "+new",
  "diff --git a/src/added.ts b/src/added.ts",
  "new file mode 100644",
  "index 0000000..cccc333",
  "--- /dev/null",
  "+++ b/src/added.ts",
  "@@ -0,0 +1,1 @@",
  "+hello",
  "",
].join("\n");

function fileAt(index: number) {
  const file = parsePatchFiles(patch)[index];

  if (file === undefined) {
    throw new Error(`no file at ${index}`);
  }

  return file;
}

const contents = new Map([
  ["aaaa111", base],
  ["bbbb222", head],
]);

describe("expansionBlobs", () => {
  test("names both sides of a modified file", () => {
    const blobs = expansionBlobs(fileAt(0));

    expect(blobs).toEqual(["aaaa111", "bbbb222"]);
  });

  test("names nothing for a file that was added", () => {
    const blobs = expansionBlobs(fileAt(1));

    expect(blobs).toEqual([]);
  });
});

describe("withBlobContents", () => {
  test("makes the unchanged lines outside the hunk available", () => {
    const expanded = withBlobContents(fileAt(0), contents);

    expect(expanded.file.additionLines).toEqual([
      "one\n",
      "two\n",
      "new\n",
      "four\n",
    ]);
  });

  test("offers only the patched lines until both sides have arrived", () => {
    const expanded = withBlobContents(fileAt(0), new Map([["aaaa111", base]]));

    expect(expanded.file.additionLines).toEqual(["new\n"]);
  });

  test("keeps the item id comments and drift re-derive from the patch", () => {
    const file = fileAt(0);

    const expanded = withBlobContents(file, contents);

    expect(expanded.id).toBe(file.id);
  });

  test("re-versions the item so the rendered diff picks up the extra lines", () => {
    const file = fileAt(0);

    const expanded = withBlobContents(file, contents);

    expect(diffItemVersion(expanded, false)).not.toBe(
      diffItemVersion(file, false)
    );
  });
});
