import { describe, expect, test } from "bun:test";
import type { DriftState } from "./drift.ts";
import {
  interleaveSegments,
  latestCodeWalkthrough,
  rangeAnchor,
  rollupDrift,
  sectionPresent,
  walkthroughStaleness,
} from "./walkthrough.ts";
import type { WalkthroughRange } from "./walkthrough.ts";

function makeRange(over: Partial<WalkthroughRange> = {}): WalkthroughRange {
  return {
    blobSha: "abc123",
    file: "src/index.ts",
    lines: [10, 24],
    side: "head",
    ...over,
  };
}

describe("rangeAnchor", () => {
  test("lifts a range into the `line` anchor arm verbatim", () => {
    expect(rangeAnchor(makeRange())).toEqual({
      blobSha: "abc123",
      file: "src/index.ts",
      kind: "line",
      lines: [10, 24],
      side: "head",
    });
  });
});

describe("interleaveSegments", () => {
  test("no markers renders prose then every range in order", () => {
    expect(interleaveSegments("The request enters here.", 2)).toEqual([
      { kind: "prose", text: "The request enters here." },
      { index: 0, kind: "range" },
      { index: 1, kind: "range" },
    ]);
  });

  test("markers interleave prose and ranges in document order", () => {
    expect(
      interleaveSegments("The request enters {{range:0}} and is parsed {{range:1}}.", 2),
    ).toEqual([
      { kind: "prose", text: "The request enters" },
      { index: 0, kind: "range" },
      { kind: "prose", text: "and is parsed" },
      { index: 1, kind: "range" },
      { kind: "prose", text: "." },
    ]);
  });

  test("drops empty prose runs between adjacent markers", () => {
    expect(interleaveSegments("{{range:0}}{{range:1}}", 2)).toEqual([
      { index: 0, kind: "range" },
      { index: 1, kind: "range" },
    ]);
  });

  test("an out-of-range marker index stays literal prose", () => {
    expect(interleaveSegments("see {{range:5}}", 1)).toEqual([
      { kind: "prose", text: "see {{range:5}}" },
      { index: 0, kind: "range" },
    ]);
  });

  test("ranges left unreferenced by markers append after the prose in index order", () => {
    expect(interleaveSegments("only {{range:1}} here", 3)).toEqual([
      { kind: "prose", text: "only" },
      { index: 1, kind: "range" },
      { kind: "prose", text: "here" },
      { index: 0, kind: "range" },
      { index: 2, kind: "range" },
    ]);
  });

  test("no ranges yields the prose alone", () => {
    expect(interleaveSegments("just words", 0)).toEqual([{ kind: "prose", text: "just words" }]);
  });
});

describe("rollupDrift", () => {
  test("worst-of is outdated > shifted > live", () => {
    expect(rollupDrift(["live", "shifted", "outdated"])).toBe("outdated");
    expect(rollupDrift(["live", "shifted", "live"])).toBe("shifted");
    expect(rollupDrift(["live", "live"])).toBe("live");
  });

  test("an empty range list is live", () => {
    expect(rollupDrift([])).toBe("live");
  });

  test("undefined (not-yet-computed) ranges are treated as live", () => {
    const states: (DriftState | undefined)[] = [undefined, "shifted"];
    expect(rollupDrift(states)).toBe("shifted");
  });
});

describe("walkthroughStaleness", () => {
  const changes = [{ id: "chg_001" }, { id: "chg_002" }, { id: "chg_003" }];

  test("born on the current head is not stale", () => {
    expect(walkthroughStaleness("chg_003", changes)).toEqual({ behind: 0, stale: false });
  });

  test("born on an earlier Change counts the Changes since", () => {
    expect(walkthroughStaleness("chg_001", changes)).toEqual({ behind: 2, stale: true });
  });

  test("an unknown born Change reads as maximally stale", () => {
    expect(walkthroughStaleness("chg_xxx", changes)).toEqual({ behind: 3, stale: true });
  });

  test("no Changes yet is not stale", () => {
    expect(walkthroughStaleness("chg_001", [])).toEqual({ behind: 0, stale: false });
  });
});

describe("latestCodeWalkthrough", () => {
  test("picks the newest code walkthrough by id, ignoring product", () => {
    const entries = [
      { id: "wlk_01A", kind: "code" as const },
      { id: "wlk_01C", kind: "product" as const },
      { id: "wlk_01B", kind: "code" as const },
    ];
    expect(latestCodeWalkthrough(entries)?.id).toBe("wlk_01B");
  });

  test("no code walkthrough yields undefined", () => {
    expect(latestCodeWalkthrough([{ id: "wlk_01C", kind: "product" as const }])).toBeUndefined();
  });
});

describe("sectionPresent", () => {
  test("live while the section id exists in the walkthrough", () => {
    expect(sectionPresent("sec_a", [{ id: "sec_a" }, { id: "sec_b" }])).toBe(true);
    expect(sectionPresent("sec_z", [{ id: "sec_a" }])).toBe(false);
  });
});
