import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import type { DriftState } from "./drift.ts";
import {
  Capture,
  interleaveSegments,
  latestCodeWalkthrough,
  rangeAnchor,
  rollupDrift,
  Walkthrough,
  walkthroughStaleness,
  WalkthroughSection,
} from "./walkthrough.ts";
import type { WalkthroughRange } from "./walkthrough.ts";

const decodeManifest = Schema.decodeUnknownSync(Walkthrough);
const decodeSection = Schema.decodeUnknownSync(WalkthroughSection);
const decodeCapture = Schema.decodeUnknownSync(Capture);

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

describe("schema — code and product arms", () => {
  test("a code manifest decodes with sections and no captures", () => {
    const manifest = decodeManifest({
      bornChangeId: "chg_002",
      id: "wlk_01A",
      kind: "code",
      schema: "docent/walkthrough@2",
      sections: ["s01-entry.md", "s02-dispatch.md"],
      title: "Entry & dispatch",
    });
    expect(manifest.sections).toEqual(["s01-entry.md", "s02-dispatch.md"]);
    expect(manifest.captures).toBeUndefined();
  });

  test("a product manifest decodes its captures[] registry", () => {
    const manifest = decodeManifest({
      bornChangeId: "chg_002",
      captures: [
        {
          dims: [1280, 2400],
          id: "cap_a",
          kind: "screenshot",
          media: "sha1",
          route: "/signup",
          viewport: [1280, 800],
        },
        {
          durationMs: 8200,
          id: "cap_b",
          kind: "recording",
          media: "sha2",
          route: "/signup",
          viewport: [1280, 800],
        },
      ],
      id: "wlk_01B",
      kind: "product",
      schema: "docent/walkthrough@2",
      sections: ["s01-upload.md"],
      title: "Uploading",
    });
    expect(manifest.captures?.map((capture) => capture.id)).toEqual(["cap_a", "cap_b"]);
    expect(manifest.captures?.at(0)).toBeInstanceOf(Capture);
  });

  test("a code section decodes its ranges", () => {
    const section = decodeSection({
      body: "The request enters here {{range:0}}.",
      id: "sec_1",
      ranges: [{ blobSha: "9c2a", file: "src/index.ts", lines: [10, 24], side: "head" }],
      schema: "docent/walkthrough-section@2",
      title: "Entry point",
    });
    expect(section.ranges?.at(0)?.file).toBe("src/index.ts");
  });

  test("a product section decodes captures and annotations", () => {
    const section = decodeSection({
      annotations: [
        {
          anchor: { capture: "cap_a", kind: "screenshot-region", rect: [0.1, 0.2, 0.3, 0.1] },
          body: "The upload control.",
        },
      ],
      body: "Drag a file {{capture:0}}.",
      captures: ["cap_a", "cap_b"],
      id: "sec_2",
      schema: "docent/walkthrough-section@2",
      title: "Uploading a file",
    });
    expect(section.captures).toEqual(["cap_a", "cap_b"]);
    expect(section.annotations?.at(0)?.anchor.kind).toBe("screenshot-region");
  });

  test("a capture with a bad kind fails to decode", () => {
    expect(() =>
      decodeCapture({ id: "cap_x", kind: "video", media: "sha", route: "/", viewport: [1, 2] }),
    ).toThrow();
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
