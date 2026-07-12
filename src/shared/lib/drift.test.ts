import { describe, expect, test } from "bun:test";

import type { FindingRecord } from "../schemas/finding";
import {
  changeHistory,
  changeHistoryLabel,
  driftBadge,
  excerptLines,
  formatBytes,
  isRealObjectId,
  parsePatchBlocks,
  planDrift,
  reanchorRange,
  splitLines,
} from "./drift";

describe("splitLines", () => {
  test("splits on newlines and drops a single trailing newline", () => {
    expect(splitLines("a\nb\nc\n")).toEqual(["a", "b", "c"]);
  });

  test("keeps a blank interior line and a no-trailing-newline file", () => {
    expect(splitLines("a\n\nc")).toEqual(["a", "", "c"]);
  });

  test("handles CRLF", () => {
    expect(splitLines("a\r\nb\r\n")).toEqual(["a", "b"]);
  });
});

describe("reanchorRange", () => {
  const born = ["one", "two", "three", "four", "five"];

  test("byte-identical file at the same lines is live", () => {
    expect(reanchorRange(born, born, [2, 3])).toEqual({
      lines: [2, 3],
      state: "live",
    });
  });

  test("the anchored block at the same line numbers is live even if the rest of the file changed", () => {
    const current = ["one", "two", "three", "four", "CHANGED"];
    expect(reanchorRange(born, current, [2, 3])).toEqual({
      lines: [2, 3],
      state: "live",
    });
  });

  test("the block pushed down by an insertion above is shifted to its new lines", () => {
    const current = ["added", "extra", "one", "two", "three", "four", "five"];
    expect(reanchorRange(born, current, [2, 3])).toEqual({
      lines: [4, 5],
      state: "shifted",
    });
  });

  test("the block pulled up by a deletion above is shifted", () => {
    const current = ["two", "three", "four", "five"];
    expect(reanchorRange(born, current, [2, 3])).toEqual({
      lines: [1, 2],
      state: "shifted",
    });
  });

  test("an edit inside the anchored range is outdated", () => {
    const current = ["one", "two", "THREE-EDITED", "four", "five"];
    expect(reanchorRange(born, current, [2, 3])).toEqual({
      lines: [2, 3],
      state: "outdated",
    });
  });

  test("a deletion of the anchored range is outdated", () => {
    const current = ["one", "four", "five"];
    expect(reanchorRange(born, current, [2, 3])).toEqual({
      lines: [2, 3],
      state: "outdated",
    });
  });

  test("an insertion into the middle of the range is outdated (no longer byte-identical)", () => {
    const current = ["one", "two", "INSERTED", "three", "four", "five"];
    expect(reanchorRange(born, current, [2, 3])).toEqual({
      lines: [2, 3],
      state: "outdated",
    });
  });

  test("prefers the block occurrence nearest the born position when repeated", () => {
    const dupBorn = ["x", "target", "y", "z", "target"];
    // Both born lines 2 and 5 are "target"; anchoring line 5 should stay near 5.
    const current = ["target", "x", "target", "y", "z", "target"];
    expect(reanchorRange(dupBorn, current, [5, 5])).toEqual({
      lines: [6, 6],
      state: "shifted",
    });
  });

  test("an out-of-bounds range is outdated", () => {
    expect(reanchorRange(born, born, [10, 12])).toEqual({
      lines: [10, 12],
      state: "outdated",
    });
  });
});

describe("excerptLines", () => {
  const text = "one\ntwo\nthree\nfour\n";

  test("extracts the anchored line range as born text", () => {
    expect(excerptLines(text, [2, 3])).toBe("two\nthree");
  });

  test("clamps a range that runs past the end", () => {
    expect(excerptLines(text, [3, 99])).toBe("three\nfour");
  });
});

describe("planDrift", () => {
  const lineAnchor = {
    blobSha: "BORN",
    file: "src/a.ts",
    kind: "line" as const,
    lines: [4, 6] as [number, number],
    side: "head" as const,
  };

  test("a change anchor never drifts", () => {
    expect(planDrift({ kind: "change" }, {})).toEqual({
      kind: "resolved",
      state: "live",
    });
  });

  test("a file anchor is live when present, unchanged path", () => {
    expect(
      planDrift(
        { blobSha: "X", file: "src/a.ts", kind: "file", side: "head" },
        {}
      )
    ).toEqual({
      kind: "resolved",
      state: "live",
    });
  });

  test("a file anchor is outdated when the file is deleted", () => {
    expect(
      planDrift(
        { blobSha: "X", file: "src/a.ts", kind: "file", side: "head" },
        { deleted: true }
      )
    ).toEqual({ kind: "resolved", state: "outdated" });
  });

  test("a file anchor is outdated when the file is renamed away", () => {
    expect(
      planDrift(
        { blobSha: "X", file: "src/a.ts", kind: "file", side: "head" },
        { renamed: true }
      )
    ).toEqual({ kind: "resolved", state: "outdated" });
  });

  test("a line anchor whose born blob still matches the current side is live", () => {
    expect(planDrift(lineAnchor, { currentSideSha: "BORN" })).toEqual({
      kind: "resolved",
      state: "live",
    });
  });

  test("a line anchor in a file absent from the current change is live", () => {
    expect(planDrift(lineAnchor, {})).toEqual({
      kind: "resolved",
      state: "live",
    });
  });

  test("a line anchor whose born blob differs asks for a re-anchor", () => {
    expect(planDrift(lineAnchor, { currentSideSha: "NEW" })).toEqual({
      bornSha: "BORN",
      currentSha: "NEW",
      kind: "reanchor",
      range: [4, 6],
    });
  });
});

describe("driftBadge", () => {
  test("live carries no drift badge", () => {
    expect(driftBadge("live", false)).toBeUndefined();
    expect(driftBadge("live", true)).toBeUndefined();
  });

  test("shifted is an informational badge regardless of resolution", () => {
    expect(driftBadge("shifted", false)).toEqual({
      label: "Shifted",
      tone: "info",
    });
    expect(driftBadge("shifted", true)).toEqual({
      label: "Shifted",
      tone: "info",
    });
  });

  test("outdated + unresolved is a re-check signal", () => {
    expect(driftBadge("outdated", false)).toEqual({
      label: "Re-check",
      tone: "signal",
    });
  });

  test("outdated + resolved is the settled end state", () => {
    expect(driftBadge("outdated", true)).toEqual({
      label: "Outdated",
      tone: "muted",
    });
  });
});

describe("changeHistory", () => {
  const claude = {
    display: "Claude Code",
    id: "claude-code",
    kind: "agent" as const,
  };
  function record(
    fields: Partial<FindingRecord> & {
      name: string;
      type: FindingRecord["type"];
    }
  ) {
    return {
      author: claude,
      body: "",
      changeId: "chg_001",
      createdAt: "2026-07-10T02:14:00Z",
      schema: "docent/finding",
      ...fields,
    } as FindingRecord;
  }

  test("labels each milestone with the change it was authored on", () => {
    const events = changeHistory([
      record({ changeId: "chg_001", name: "001-open.md", type: "open" }),
      record({ changeId: "chg_003", name: "002-reply.md", type: "reply" }),
      record({ changeId: "chg_004", name: "003-resolve.md", type: "resolve" }),
    ]);

    expect(events).toEqual([
      { changeId: "chg_001", verb: "opened" },
      { changeId: "chg_003", verb: "replied" },
      { changeId: "chg_004", verb: "resolved" },
    ]);
  });

  test("collapses consecutive replies into one milestone", () => {
    const events = changeHistory([
      record({ changeId: "chg_001", name: "001-open.md", type: "open" }),
      record({ changeId: "chg_002", name: "002-reply.md", type: "reply" }),
      record({ changeId: "chg_002", name: "003-reply.md", type: "reply" }),
      record({ changeId: "chg_003", name: "004-resolve.md", type: "resolve" }),
    ]);

    expect(events.map((event) => event.verb)).toEqual([
      "opened",
      "replied",
      "resolved",
    ]);
  });

  test("edit records are not milestones", () => {
    const events = changeHistory([
      record({ changeId: "chg_001", name: "001-open.md", type: "open" }),
      record({
        changeId: "chg_002",
        edits: "001-open.md",
        name: "002-edit.md",
        type: "edit",
      }),
    ]);

    expect(events).toEqual([{ changeId: "chg_001", verb: "opened" }]);
  });

  test("renders a one-line label", () => {
    expect(
      changeHistoryLabel([
        record({ changeId: "chg_001", name: "001-open.md", type: "open" }),
        record({
          changeId: "chg_004",
          name: "002-resolve.md",
          type: "resolve",
        }),
      ])
    ).toBe("opened on chg_001 · resolved on chg_004");
  });

  test("an empty record list has no label", () => {
    expect(changeHistoryLabel([])).toBe("");
  });
});

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
