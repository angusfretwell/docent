import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import type { DriftState } from "../schemas/drift.ts";
import {
  captureById,
  identityDrift,
  interleaveCaptureSegments,
  interleaveSegments,
  latestCodeWalkthrough,
  latestProductWalkthrough,
  rangeAnchor,
  rollupDrift,
  walkthroughStaleness,
} from "./walkthrough.ts";
import { Capture, Walkthrough, WalkthroughSection } from "../schemas/walkthrough.ts";
import type { WalkthroughRange } from "../schemas/walkthrough.ts";

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

describe("latestProductWalkthrough", () => {
  test("picks the newest product walkthrough by id, ignoring code", () => {
    const entries = [
      { id: "wlk_01A", kind: "product" as const },
      { id: "wlk_01D", kind: "code" as const },
      { id: "wlk_01C", kind: "product" as const },
    ];
    expect(latestProductWalkthrough(entries)?.id).toBe("wlk_01C");
  });

  test("no product walkthrough yields undefined", () => {
    expect(latestProductWalkthrough([{ id: "wlk_01A", kind: "code" as const }])).toBeUndefined();
  });
});

describe("interleaveCaptureSegments", () => {
  test("no markers renders prose then every capture in order", () => {
    expect(interleaveCaptureSegments("Drag a file onto the dropzone.", 2)).toEqual([
      { kind: "prose", text: "Drag a file onto the dropzone." },
      { index: 0, kind: "capture" },
      { index: 1, kind: "capture" },
    ]);
  });

  test("markers interleave prose and captures in document order", () => {
    expect(
      interleaveCaptureSegments("Drag {{capture:0}} and the upload begins {{capture:1}}.", 2),
    ).toEqual([
      { kind: "prose", text: "Drag" },
      { index: 0, kind: "capture" },
      { kind: "prose", text: "and the upload begins" },
      { index: 1, kind: "capture" },
      { kind: "prose", text: "." },
    ]);
  });

  test("an out-of-range marker index stays literal prose", () => {
    expect(interleaveCaptureSegments("see {{capture:5}}", 1)).toEqual([
      { kind: "prose", text: "see {{capture:5}}" },
      { index: 0, kind: "capture" },
    ]);
  });

  test("captures left unreferenced append after the prose in index order", () => {
    expect(interleaveCaptureSegments("only {{capture:1}} here", 3)).toEqual([
      { kind: "prose", text: "only" },
      { index: 1, kind: "capture" },
      { kind: "prose", text: "here" },
      { index: 0, kind: "capture" },
      { index: 2, kind: "capture" },
    ]);
  });

  test("range and capture markers do not cross-fire", () => {
    // A `{{range:0}}` marker is inert in a product body — it stays literal prose,
    // and the lone capture still appends after (the flat fallback).
    expect(interleaveCaptureSegments("uses {{range:0}} not captures", 1)).toEqual([
      { kind: "prose", text: "uses {{range:0}} not captures" },
      { index: 0, kind: "capture" },
    ]);
  });
});

describe("identityDrift", () => {
  test("present in the shown walkthrough is live; absent is outdated (no shifted)", () => {
    expect(identityDrift(true)).toBe("live");
    expect(identityDrift(false)).toBe("outdated");
  });
});

describe("Capture schema (dims and durationMs)", () => {
  test("decodes a screenshot with dims", () => {
    const capture = decodeCapture({
      dims: [1280, 2400],
      id: "cap_a",
      kind: "screenshot",
      media: "sha-a",
      route: "/signup",
      viewport: [1280, 800],
    });
    expect(capture.kind).toBe("screenshot");
    expect(capture.dims).toEqual([1280, 2400]);
    expect(capture.durationMs).toBeUndefined();
  });

  test("decodes a recording with durationMs", () => {
    const capture = decodeCapture({
      durationMs: 8200,
      id: "cap_b",
      kind: "recording",
      media: "sha-b",
      route: "/signup",
      viewport: [1280, 800],
    });
    expect(capture.kind).toBe("recording");
    expect(capture.durationMs).toBe(8200);
  });
});

describe("Walkthrough product manifest", () => {
  const manifest = {
    bornChangeId: "chg_002",
    captures: [
      {
        dims: [1280, 2400],
        id: "cap_a",
        kind: "screenshot",
        media: "sha-a",
        route: "/",
        viewport: [1280, 800],
      },
      {
        durationMs: 8200,
        id: "cap_b",
        kind: "recording",
        media: "sha-b",
        route: "/",
        viewport: [1280, 800],
      },
    ],
    id: "wlk_01A",
    kind: "product",
    schema: "docent/walkthrough@2",
    sections: ["s01-upload.md"],
    title: "Signup",
  };

  test("decodes the captures[] registry as typed captures", () => {
    const decoded = decodeManifest(manifest);
    expect(decoded.captures?.map((capture) => capture.id)).toEqual(["cap_a", "cap_b"]);
    expect(decoded.captures?.[0]?.kind).toBe("screenshot");
  });

  test("captureById finds a registered capture and misses an unknown id", () => {
    const decoded = decodeManifest(manifest);
    expect(captureById(decoded, "cap_b")?.kind).toBe("recording");
    expect(captureById(decoded, "cap_z")).toBeUndefined();
  });
});

describe("WalkthroughSection product frontmatter", () => {
  test("decodes captures ids and annotations with capture anchors", () => {
    const section = decodeSection({
      annotations: [
        {
          anchor: { capture: "cap_a", kind: "screenshot-region", rect: [0.1, 0.2, 0.3, 0.1] },
          body: "The upload control.",
        },
        {
          anchor: { capture: "cap_b", fromMs: 3200, kind: "recording-timestamp", toMs: 5000 },
          body: "Validation fires.",
        },
      ],
      body: "Drag a file {{capture:0}}.",
      captures: ["cap_a", "cap_b"],
      id: "sec_1",
      schema: "docent/walkthrough-section@2",
      title: "Uploading a file",
    });
    expect(section.captures).toEqual(["cap_a", "cap_b"]);
    expect(section.annotations?.length).toBe(2);
    expect(section.annotations?.[0]?.anchor.kind).toBe("screenshot-region");
    expect(section.annotations?.[1]?.anchor.kind).toBe("recording-timestamp");
  });

  test("decodes a whole-capture annotation with the coordinate omitted", () => {
    const section = decodeSection({
      annotations: [
        { anchor: { capture: "cap_a", kind: "screenshot-region" }, body: "This whole screen." },
      ],
      body: "Overview.",
      captures: ["cap_a"],
      id: "sec_2",
      schema: "docent/walkthrough-section@2",
      title: "Overview",
    });
    const anchor = section.annotations?.[0]?.anchor;
    expect(anchor?.kind).toBe("screenshot-region");
    expect(anchor?.kind === "screenshot-region" ? anchor.rect : "x").toBeUndefined();
  });
});
