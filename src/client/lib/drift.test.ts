import { describe, expect, test } from "bun:test";

import type { DriftPlan } from "@shared/schemas/drift";
import type { Anchor } from "@shared/schemas/finding";

import type { DiffFile } from "./drift";
import { anchorContext, indexDiffFiles, triagePlan } from "./drift";

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

function lineAnchor(
  overrides: Partial<Extract<Anchor, { kind: "line" }>> = {}
): Anchor {
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
    const files = new Map([
      ["src/a.ts", file({ deleted: true, newObjectId: "0".repeat(40) })],
    ]);

    expect(anchorContext(lineAnchor(), files).deleted).toBe(true);
  });

  test("a rename flags renamed only for an anchor born on the old path", () => {
    const renamed = file({
      name: "src/b.ts",
      prevName: "src/a.ts",
      renamed: true,
    });
    const files = new Map([
      ["src/b.ts", renamed],
      ["src/a.ts", renamed],
    ]);

    // Born on the old path (src/a.ts) → renamed away.
    expect(anchorContext(lineAnchor({ file: "src/a.ts" }), files).renamed).toBe(
      true
    );
    // Born on the new path (src/b.ts) → not renamed away.
    expect(anchorContext(lineAnchor({ file: "src/b.ts" }), files).renamed).toBe(
      false
    );
  });
});

describe("triagePlan", () => {
  const NULL = "0".repeat(40);

  test("a settled line/range plan is a base result at its lines", () => {
    const plan: DriftPlan = { kind: "resolved", state: "live" };

    expect(triagePlan("k", plan, [1, 2])).toEqual({
      base: { lines: [1, 2], state: "live" },
    });
  });

  test("a settled whole-file/change plan (no lines) is a base result with no lines", () => {
    const plan: DriftPlan = { kind: "resolved", state: "outdated" };

    expect(triagePlan("k", plan)).toEqual({
      base: { state: "outdated" },
    });
  });

  test("a re-anchor whose current side names real content becomes a fetch job", () => {
    const plan: DriftPlan = {
      bornSha: "aaaa111",
      currentSha: "bbbb222",
      kind: "reanchor",
      range: [4, 6],
    };

    expect(triagePlan("k", plan, [4, 6])).toEqual({
      job: {
        bornSha: "aaaa111",
        currentSha: "bbbb222",
        id: "k",
        range: [4, 6],
      },
    });
  });

  test("a re-anchor whose current side is gone is outdated now and asks for the born excerpt", () => {
    const plan: DriftPlan = {
      bornSha: "aaaa111",
      currentSha: NULL,
      kind: "reanchor",
      range: [4, 6],
    };

    expect(triagePlan("k", plan, [4, 6])).toEqual({
      base: { lines: [4, 6], state: "outdated" },
      excerpt: { bornSha: "aaaa111", id: "k", range: [4, 6] },
    });
  });

  test("a re-anchor with neither side addressable settles outdated with no fetch", () => {
    const plan: DriftPlan = {
      bornSha: NULL,
      currentSha: NULL,
      kind: "reanchor",
      range: [4, 6],
    };

    expect(triagePlan("k", plan, [4, 6])).toEqual({
      base: { lines: [4, 6], state: "outdated" },
    });
  });
});
