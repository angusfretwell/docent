import { describe, expect, test } from "bun:test";

import type { Anchor } from "@shared/schemas/comment";

import { itemId, parsePatchFiles } from "./diff";
import { anchorDiffTarget, rendersRange } from "./diff-target";

const HEAD = "bbbb222";
const BASE = "aaaa111";

const patch = [
  "diff --git a/src/a.ts b/src/a.ts",
  `index ${BASE}..${HEAD} 100644`,
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -10,3 +10,3 @@",
  " ten",
  "-old",
  "+new",
  " twelve",
  "",
].join("\n");

// The sides sit at different line numbers, so a range placed on one of them
// cannot pass for the other.
const sidesApartPatch = [
  "diff --git a/src/moved.ts b/src/moved.ts",
  `index ${BASE}..${HEAD} 100644`,
  "--- a/src/moved.ts",
  "+++ b/src/moved.ts",
  "@@ -10,2 +20,3 @@",
  " ten",
  "-old",
  "+new",
  "+extra",
  "",
].join("\n");

const files = parsePatchFiles(patch);
const item = itemId("src/a.ts", 0);

function fileDiffOf(patchText: string) {
  const [entry] = parsePatchFiles(patchText);

  if (entry === undefined) {
    throw new Error("patch parsed to no files");
  }

  return entry.file;
}

const sidesApart = fileDiffOf(sidesApartPatch);

function lineAnchor(
  overrides: Partial<Extract<Anchor, { kind: "line" }>> = {}
): Anchor {
  return {
    blobSha: HEAD,
    file: "src/a.ts",
    kind: "line",
    lines: [11, 11],
    side: "head",
    ...overrides,
  };
}

describe("rendersRange", () => {
  test("a range inside a hunk renders", () => {
    expect(rendersRange(sidesApart, "head", [20, 22])).toBe(true);
  });

  test("a range past every hunk renders nowhere", () => {
    expect(rendersRange(sidesApart, "head", [40, 41])).toBe(false);
  });

  test("a range that runs off the end of its hunk does not render", () => {
    expect(rendersRange(sidesApart, "head", [22, 23])).toBe(false);
  });

  test("a base range renders against the deleted lines", () => {
    expect(rendersRange(sidesApart, "base", [10, 11])).toBe(true);
  });

  test("the added lines of a hunk do not render on the base side", () => {
    expect(rendersRange(sidesApart, "base", [20, 21])).toBe(false);
  });
});

describe("anchorDiffTarget", () => {
  test("a live line anchor targets its line on the additions side", () => {
    const target = anchorDiffTarget({
      anchor: lineAnchor(),
      drift: { lines: [11, 11], state: "live" },
      files,
    });

    expect(target).toEqual({ id: item, line: { number: 11, side: "head" } });
  });

  test("a base-side anchor keeps its side, so the deletions column is read", () => {
    const target = anchorDiffTarget({
      anchor: lineAnchor({ blobSha: BASE, side: "base" }),
      drift: { lines: [11, 11], state: "live" },
      files,
    });

    expect(target).toEqual({ id: item, line: { number: 11, side: "base" } });
  });

  test("a shifted anchor targets where it was re-anchored, not where it was born", () => {
    const target = anchorDiffTarget({
      anchor: lineAnchor({ lines: [10, 10] }),
      drift: { lines: [12, 12], state: "shifted" },
      files,
    });

    expect(target).toEqual({ id: item, line: { number: 12, side: "head" } });
  });

  test("an outdated anchor stands nowhere, so only its file is targeted", () => {
    const target = anchorDiffTarget({
      anchor: lineAnchor(),
      drift: { lines: [11, 11], state: "outdated" },
      files,
    });

    expect(target).toEqual({ id: item });
  });

  test("drift the reader is still waiting on targets the file alone", () => {
    const target = anchorDiffTarget({ anchor: lineAnchor(), files });

    expect(target).toEqual({ id: item });
  });

  test("a line the patch never renders falls back to its file", () => {
    const target = anchorDiffTarget({
      anchor: lineAnchor({ lines: [400, 400] }),
      drift: { lines: [400, 400], state: "live" },
      files,
    });

    expect(target).toEqual({ id: item });
  });

  test("a file anchor targets its file", () => {
    const target = anchorDiffTarget({
      anchor: { blobSha: HEAD, file: "src/a.ts", kind: "file", side: "head" },
      drift: { state: "live" },
      files,
    });

    expect(target).toEqual({ id: item });
  });

  test("a comment whose anchor never decoded still reaches its file", () => {
    const target = anchorDiffTarget({ anchorFile: "src/a.ts", files });

    expect(target).toEqual({ id: item });
  });

  test("a file outside the change has nowhere to be shown", () => {
    const target = anchorDiffTarget({
      anchor: lineAnchor({ file: "src/gone.ts" }),
      drift: { lines: [11, 11], state: "live" },
      files,
    });

    expect(target).toBeUndefined();
  });
});
