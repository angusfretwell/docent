import { describe, expect, test } from "bun:test";

import type { FoldedFinding } from "@shared/lib/finding";
import type { Anchor } from "@shared/schemas/finding";
import type { CaptureId, FindingId } from "@shared/schemas/ids";
import type {
  Capture,
  WalkthroughAnnotation,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";

import {
  annotationsFor,
  captureAnchorId,
  captureCallouts,
  captureFindingDrift,
  recordingPins,
  screenshotPins,
} from "./walkthrough-pins";

const changeAnchor: Extract<Anchor, { kind: "change" }> = { kind: "change" };

function regionAnchor(
  captureId: string,
  rect?: readonly [number, number, number, number]
): Extract<Anchor, { kind: "screenshot-region" }> {
  return rect === undefined
    ? { capture: captureId as CaptureId, kind: "screenshot-region" }
    : { capture: captureId as CaptureId, kind: "screenshot-region", rect };
}

function timestampAnchor(
  captureId: string,
  fromMs?: number,
  toMs?: number
): Extract<Anchor, { kind: "recording-timestamp" }> {
  return {
    capture: captureId as CaptureId,
    kind: "recording-timestamp",
    ...(fromMs === undefined ? {} : { fromMs }),
    ...(toMs === undefined ? {} : { toMs }),
  };
}

function annotation(
  anchor: WalkthroughAnnotation["anchor"],
  body: string
): WalkthroughAnnotation {
  return { anchor, body } as WalkthroughAnnotation;
}

function finding(anchor: FoldedFinding["anchor"], body: string): FoldedFinding {
  return {
    anchor,
    body,
    id: `fnd_${body}` as FindingId,
    participants: [],
    replies: [],
    status: "open",
  };
}

function capture(id: string, kind: Capture["kind"] = "screenshot"): Capture {
  return {
    id,
    kind,
    media: "media-sha",
    route: "/",
    viewport: [800, 600],
  } as unknown as Capture;
}

function section_(over: Partial<WalkthroughSection> = {}): WalkthroughSection {
  return {
    body: "",
    id: "sec_1",
    schema: "docent/walkthrough-section",
    title: "Section",
    ...over,
  } as WalkthroughSection;
}

describe("captureAnchorId", () => {
  test("reads the capture id off a screenshot-region anchor", () => {
    expect(captureAnchorId(regionAnchor("cap_1"))).toBe("cap_1");
  });

  test("reads the capture id off a recording-timestamp anchor", () => {
    expect(captureAnchorId(timestampAnchor("cap_2"))).toBe("cap_2");
  });

  test("is undefined for a non-capture anchor", () => {
    expect(captureAnchorId(changeAnchor)).toBeUndefined();
  });

  test("is undefined when there is no anchor at all", () => {
    expect(captureAnchorId()).toBeUndefined();
  });
});

describe("captureFindingDrift", () => {
  const placed = new Set(["cap_1"]);

  test("is live when the anchor's capture is placed in a section", () => {
    expect(captureFindingDrift(regionAnchor("cap_1"), placed)).toBe("live");
  });

  test("is outdated when the anchor's capture is no longer placed", () => {
    expect(captureFindingDrift(regionAnchor("cap_9"), placed)).toBe("outdated");
  });

  test("is undefined for a non-capture anchor", () => {
    expect(captureFindingDrift(changeAnchor, placed)).toBeUndefined();
  });
});

describe("screenshotPins", () => {
  test("keeps only pins that carry a rect, numbering annotations and findings separately", () => {
    const annotations = [
      annotation(
        regionAnchor("cap_1", [0.1, 0.1, 0.2, 0.2]),
        "annotation with a rect"
      ),
      annotation(regionAnchor("cap_1"), "whole annotation"),
    ];
    const findings = [
      finding(
        regionAnchor("cap_1", [0.5, 0.5, 0.1, 0.1]),
        "finding with a rect"
      ),
    ];

    const regions = screenshotPins(annotations, findings, capture("cap_1"));

    expect(regions).toEqual([
      {
        body: "annotation with a rect",
        label: "A1",
        rect: [0.1, 0.1, 0.2, 0.2],
      },
      {
        body: "finding with a rect",
        label: "F1",
        rect: [0.5, 0.5, 0.1, 0.1],
      },
    ]);
  });

  test("filters findings to the given capture, trusting annotations are already scoped to it by annotationsFor", () => {
    const findings = [
      finding(
        regionAnchor("cap_other", [0.5, 0.5, 0.1, 0.1]),
        "wrong capture, filtered out"
      ),
    ];

    const regions = screenshotPins([], findings, capture("cap_1"));

    expect(regions).toEqual([]);
  });
});

describe("recordingPins", () => {
  test("keeps only pins that carry an offset", () => {
    const annotations = [
      annotation(timestampAnchor("cap_1", 1000, 2000), "seek annotation"),
    ];
    const findings = [finding(timestampAnchor("cap_1"), "whole finding")];

    const times = recordingPins(annotations, findings, capture("cap_1"));

    expect(times).toEqual([
      {
        atMs: 1000,
        body: "seek annotation",
        label: "A1",
        toMs: 2000,
      },
    ]);
  });
});

describe("captureCallouts", () => {
  test("carries the body of every screenshot pin, placed or not, under its overlay label", () => {
    const annotations = [
      annotation(regionAnchor("cap_1", [0.1, 0.1, 0.2, 0.2]), "placed"),
      annotation(regionAnchor("cap_1"), "unplaced"),
    ];
    const findings = [finding(regionAnchor("cap_1"), "a reviewer's note")];

    const callouts = captureCallouts(annotations, findings, capture("cap_1"));

    expect(callouts).toEqual([
      { body: "placed", label: "A1" },
      { body: "unplaced", label: "A2" },
      { body: "a reviewer's note", label: "F1" },
    ]);
  });

  test("reads a recording's pins through the timestamp arm", () => {
    const annotations = [
      annotation(timestampAnchor("cap_1", 1000), "at one second"),
    ];

    const callouts = captureCallouts(
      annotations,
      [],
      capture("cap_1", "recording")
    );

    expect(callouts).toEqual([{ body: "at one second", label: "A1" }]);
  });
});

describe("annotationsFor", () => {
  test("keeps only the annotations whose capture-arm anchor targets the given capture", () => {
    const section = section_({
      annotations: [
        annotation(regionAnchor("cap_1"), "on cap_1"),
        annotation(regionAnchor("cap_2"), "on cap_2"),
        annotation(changeAnchor, "not capture-anchored"),
      ],
    });

    const result = annotationsFor(section, "cap_1");

    expect(result.map((entry) => entry.body)).toEqual(["on cap_1"]);
  });

  test("an empty annotations list yields no matches", () => {
    const section = section_({});

    expect(annotationsFor(section, "cap_1")).toEqual([]);
  });
});
