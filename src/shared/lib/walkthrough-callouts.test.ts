import { describe, expect, test } from "bun:test";

import { Schema } from "effect";

import type { DriftState } from "../enums/drift-state";
import {
  Capture,
  Walkthrough,
  WalkthroughSection,
} from "../schemas/walkthrough";
import type { Callout, WalkthroughRange } from "../schemas/walkthrough";
import {
  captureById,
  foldSectionCallouts,
  rangeAnchor,
  rollupDrift,
  walkthroughStaleness,
} from "./walkthrough-callouts";

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
    expect(walkthroughStaleness("chg_003", changes)).toEqual({
      behind: 0,
      stale: false,
    });
  });

  test("born on an earlier Change counts the Changes since", () => {
    expect(walkthroughStaleness("chg_001", changes)).toEqual({
      behind: 2,
      stale: true,
    });
  });

  test("an unknown born Change reads as maximally stale", () => {
    expect(walkthroughStaleness("chg_xxx", changes)).toEqual({
      behind: 3,
      stale: true,
    });
  });

  test("no Changes yet is not stale", () => {
    expect(walkthroughStaleness("chg_001", [])).toEqual({
      behind: 0,
      stale: false,
    });
  });
});

describe("schema — code and product arms", () => {
  test("a code manifest decodes with sections and no captures", () => {
    const manifest = decodeManifest({
      bornChangeId: "chg_002",
      id: "wlk_01A",
      kind: "code",
      schema: "docent/walkthrough",
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
      schema: "docent/walkthrough",
      sections: ["s01-upload.md"],
      title: "Uploading",
    });
    expect(manifest.captures?.map((capture) => capture.id as string)).toEqual([
      "cap_a",
      "cap_b",
    ]);
    expect(manifest.captures?.at(0)).toBeInstanceOf(Capture);
  });

  test("a code section decodes its ranges", () => {
    const section = decodeSection({
      body: "The request enters here {{range:0}}.",
      id: "sec_1",
      ranges: [
        {
          blobSha: "9c2a",
          file: "src/index.ts",
          lines: [10, 24],
          side: "head",
        },
      ],
      schema: "docent/walkthrough-section",
      title: "Entry point",
    });
    expect(section.ranges?.at(0)?.file).toBe("src/index.ts");
  });

  test("a product section decodes captures and callouts", () => {
    const section = decodeSection({
      body: "Drag a file {{capture:0}}.",
      callouts: [
        {
          anchor: {
            capture: "cap_a",
            kind: "screenshot-region",
            rect: [0.1, 0.2, 0.3, 0.1],
          },
          body: "The upload control.",
        },
      ],
      captures: ["cap_a", "cap_b"],
      id: "sec_2",
      schema: "docent/walkthrough-section",
      title: "Uploading a file",
    });
    expect(section.captures as readonly string[] | undefined).toEqual([
      "cap_a",
      "cap_b",
    ]);
    expect(section.callouts?.at(0)?.anchor.kind).toBe("screenshot-region");
  });

  test("a capture with a bad kind fails to decode", () => {
    expect(() =>
      decodeCapture({
        id: "cap_x",
        kind: "video",
        media: "sha",
        route: "/",
        viewport: [1, 2],
      })
    ).toThrow();
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
    schema: "docent/walkthrough",
    sections: ["s01-upload.md"],
    title: "Signup",
  };

  test("decodes the captures[] registry as typed captures", () => {
    const decoded = decodeManifest(manifest);
    expect(decoded.captures?.map((capture) => capture.id as string)).toEqual([
      "cap_a",
      "cap_b",
    ]);
    expect(decoded.captures?.[0]?.kind).toBe("screenshot");
  });

  test("captureById finds a registered capture and misses an unknown id", () => {
    const decoded = decodeManifest(manifest);
    expect(captureById(decoded, "cap_b")?.kind).toBe("recording");
    expect(captureById(decoded, "cap_z")).toBeUndefined();
  });
});

describe("WalkthroughSection product frontmatter", () => {
  test("decodes captures ids and callouts with capture anchors", () => {
    const section = decodeSection({
      body: "Drag a file {{capture:0}}.",
      callouts: [
        {
          anchor: {
            capture: "cap_a",
            kind: "screenshot-region",
            rect: [0.1, 0.2, 0.3, 0.1],
          },
          body: "The upload control.",
        },
        {
          anchor: {
            capture: "cap_b",
            fromMs: 3200,
            kind: "recording-timestamp",
            toMs: 5000,
          },
          body: "Validation fires.",
        },
      ],
      captures: ["cap_a", "cap_b"],
      id: "sec_1",
      schema: "docent/walkthrough-section",
      title: "Uploading a file",
    });
    expect(section.captures as readonly string[] | undefined).toEqual([
      "cap_a",
      "cap_b",
    ]);
    expect(section.callouts?.length).toBe(2);
    expect(section.callouts?.[0]?.anchor.kind).toBe("screenshot-region");
    expect(section.callouts?.[1]?.anchor.kind).toBe("recording-timestamp");
  });

  test("decodes a whole-capture callout with the coordinate omitted", () => {
    const section = decodeSection({
      body: "Overview.",
      callouts: [
        {
          anchor: { capture: "cap_a", kind: "screenshot-region" },
          body: "This whole screen.",
        },
      ],
      captures: ["cap_a"],
      id: "sec_2",
      schema: "docent/walkthrough-section",
      title: "Overview",
    });
    const anchor = section.callouts?.[0]?.anchor;
    expect(anchor?.kind).toBe("screenshot-region");
    expect(
      anchor?.kind === "screenshot-region" ? anchor.rect : "x"
    ).toBeUndefined();
  });
});

describe("foldSectionCallouts", () => {
  function calloutsOf(callouts: readonly unknown[]): readonly Callout[] {
    return (
      decodeSection({
        body: "Body.",
        callouts,
        id: "sec_x",
        schema: "docent/walkthrough-section",
        title: "Section",
      }).callouts ?? []
    );
  }

  test("skips capture-arm callouts — they pin to their capture", () => {
    const folded = foldSectionCallouts(
      calloutsOf([
        { anchor: { capture: "cap_a", kind: "screenshot-region" }, body: "A" },
        {
          anchor: { capture: "cap_b", kind: "recording-timestamp" },
          body: "B",
        },
      ])
    );

    expect(folded.notes).toEqual([]);
    expect(folded.quotes).toEqual([]);
  });

  test("surfaces a file-anchored callout as a note located by its file", () => {
    const folded = foldSectionCallouts(
      calloutsOf([
        {
          anchor: {
            blobSha: "sha",
            file: "src/upload.tsx",
            kind: "file",
            side: "head",
          },
          body: "This screen is driven by the upload module.",
        },
      ])
    );

    expect(folded.notes).toEqual([
      {
        body: "This screen is driven by the upload module.",
        location: "src/upload.tsx",
      },
    ]);
  });

  test("locates line, change, and walkthrough-section callout notes", () => {
    const folded = foldSectionCallouts(
      calloutsOf([
        {
          anchor: {
            blobSha: "sha",
            file: "src/a.ts",
            kind: "line",
            lines: [4, 9],
            side: "head",
          },
          body: "L",
        },
        { anchor: { kind: "change" }, body: "C" },
        {
          anchor: {
            kind: "walkthrough-section",
            sectionId: "sec_9",
            walkthroughId: "wlk_1",
          },
          body: "S",
        },
      ])
    );

    expect(folded.notes).toEqual([
      { body: "L", location: "src/a.ts:4" },
      { body: "C", location: "Whole change" },
      { body: "S", location: "§ sec_9" },
    ]);
  });

  test("a text-span callout both notes and highlights its quote", () => {
    const folded = foldSectionCallouts(
      calloutsOf([
        {
          anchor: { kind: "text-span", quote: "on blur", section: "sec_x" },
          body: "Validation fires.",
        },
      ])
    );

    expect(folded.notes).toEqual([
      { body: "Validation fires.", location: "on blur" },
    ]);
    expect(folded.quotes).toEqual(["on blur"]);
  });

  test("mixes arms without dropping any non-capture callout", () => {
    const folded = foldSectionCallouts(
      calloutsOf([
        {
          anchor: {
            capture: "cap_a",
            kind: "screenshot-region",
            rect: [0.1, 0.2, 0.3, 0.1],
          },
          body: "pin",
        },
        {
          anchor: {
            blobSha: "sha",
            file: "src/x.ts",
            kind: "file",
            side: "head",
          },
          body: "file",
        },
        {
          anchor: { kind: "text-span", quote: "q", section: "sec_x" },
          body: "span",
        },
      ])
    );

    expect(folded.notes).toEqual([
      { body: "file", location: "src/x.ts" },
      { body: "span", location: "q" },
    ]);
    expect(folded.quotes).toEqual(["q"]);
  });
});
