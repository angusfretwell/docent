import { describe, expect, test } from "bun:test";
import type { Anchor } from "../../shared/schemas/finding.ts";
import type { DiffFile } from "./drift.ts";
import { anchorContext, indexDiffFiles } from "./drift.ts";

const HEAD = "bbbb222";
const BASE = "aaaa111";

const modifyPatch = [
  "diff --git a/src/a.ts b/src/a.ts",
  `index ${BASE}..${HEAD} 100644`,
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,2 @@",
  "-old",
  "+new",
  " ctx",
  "",
].join("\n");

function file(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    deleted: false,
    name: "src/a.ts",
    newObjectId: HEAD,
    prevObjectId: BASE,
    renamed: false,
    ...overrides,
  };
}

function lineAnchor(overrides: Partial<Extract<Anchor, { kind: "line" }>> = {}): Anchor {
  return {
    blobSha: HEAD,
    file: "src/a.ts",
    kind: "line",
    lines: [1, 1],
    side: "head",
    ...overrides,
  };
}

describe("indexDiffFiles", () => {
  test("indexes a modified file's blob shas from the patch", () => {
    const files = indexDiffFiles(modifyPatch);
    const entry = files.get("src/a.ts");

    expect(entry?.newObjectId).toBe(HEAD);
    expect(entry?.prevObjectId).toBe(BASE);
    expect(entry?.deleted).toBe(false);
  });
});

describe("anchorContext", () => {
  test("a non-code anchor has an empty context", () => {
    expect(anchorContext({ kind: "change" }, new Map())).toEqual({});
  });

  test("a file absent from the change has an empty context (unchanged base..head)", () => {
    expect(anchorContext(lineAnchor(), new Map())).toEqual({});
  });

  test("a head-side anchor reads the file's head blob", () => {
    const files = new Map([["src/a.ts", file()]]);

    expect(anchorContext(lineAnchor({ side: "head" }), files)).toEqual({
      currentSideSha: HEAD,
      deleted: false,
      renamed: false,
    });
  });

  test("a base-side anchor reads the file's base blob", () => {
    const files = new Map([["src/a.ts", file()]]);

    expect(anchorContext(lineAnchor({ side: "base" }), files)).toEqual({
      currentSideSha: BASE,
      deleted: false,
      renamed: false,
    });
  });

  test("a deleted file's anchor is flagged deleted", () => {
    const files = new Map([["src/a.ts", file({ deleted: true, newObjectId: "0".repeat(40) })]]);

    expect(anchorContext(lineAnchor(), files).deleted).toBe(true);
  });

  test("a rename flags renamed only for an anchor born on the old path", () => {
    const renamed = file({ name: "src/b.ts", prevName: "src/a.ts", renamed: true });
    const files = new Map([
      ["src/b.ts", renamed],
      ["src/a.ts", renamed],
    ]);

    // Born on the old path (src/a.ts) → renamed away.
    expect(anchorContext(lineAnchor({ file: "src/a.ts" }), files).renamed).toBe(true);
    // Born on the new path (src/b.ts) → not renamed away.
    expect(anchorContext(lineAnchor({ file: "src/b.ts" }), files).renamed).toBe(false);
  });
});
