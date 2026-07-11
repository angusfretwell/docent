import { describe, expect, test } from "bun:test";

import type { WalkthroughRange } from "@shared/schemas/walkthrough";

import { indexDiffFiles } from "./drift";
import { planRange } from "./walkthrough-drift";

const HEAD = "bbbb222";
const BASE = "aaaa111";
const NULL = "0".repeat(40);

function keyed(over: Partial<WalkthroughRange> = {}) {
  const range: WalkthroughRange = {
    blobSha: BASE,
    file: "src/a.ts",
    lines: [1, 2],
    side: "head",
    ...over,
  };
  return { key: "sec#0", range };
}

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

const deletePatch = [
  "diff --git a/src/a.ts b/src/a.ts",
  `deleted file mode 100644`,
  `index ${BASE}..${NULL} 100644`,
  "--- a/src/a.ts",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-old",
  "-gone",
  "",
].join("\n");

describe("planRange", () => {
  test("a range in a file unchanged base..head is live at its born lines", () => {
    const files = indexDiffFiles("");
    expect(planRange(keyed(), files)).toEqual({
      key: "sec#0",
      kind: "resolved",
      result: { lines: [1, 2], state: "live" },
    });
  });

  test("a range whose born blob still equals the current side is live without a fetch", () => {
    const files = indexDiffFiles(modifyPatch);
    // Born on the current head blob → no re-anchor needed.
    expect(planRange(keyed({ blobSha: HEAD }), files)).toMatchObject({
      kind: "resolved",
      result: { state: "live" },
    });
  });

  test("a range whose born blob differs from the current side requests a re-anchor", () => {
    const files = indexDiffFiles(modifyPatch);
    expect(planRange(keyed({ blobSha: BASE }), files)).toEqual({
      bornSha: BASE,
      currentSha: HEAD,
      key: "sec#0",
      kind: "reanchor",
      range: [1, 2],
    });
  });

  test("a range whose current side is gone (deletion) asks only for the born excerpt", () => {
    const files = indexDiffFiles(deletePatch);
    expect(planRange(keyed({ blobSha: BASE }), files)).toEqual({
      bornSha: BASE,
      key: "sec#0",
      kind: "excerpt",
      range: [1, 2],
    });
  });
});
