import { describe, expect, test } from "bun:test";

import type { FoldedComment } from "@shared/lib/comment";
import type { Anchor } from "@shared/schemas/comment";
import type { CaptureId, CommentId } from "@shared/schemas/ids";
import type {
  Capture,
  Callout,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";

import {
  calloutsFor,
  captureAnchorId,
  captureCallouts,
  captureCommentDrift,
  recordingPins,
  screenshotPins,
} from "./pins";

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

function callout(anchor: Callout["anchor"], body: string): Callout {
  return { anchor, body } as Callout;
}

function comment(anchor: FoldedComment["anchor"], body: string): FoldedComment {
  return {
    anchor,
    body,
    id: `cmt_${body}` as CommentId,
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

describe("captureCommentDrift", () => {
  const placed = new Set(["cap_1"]);

  test("is live when the anchor's capture is placed in a section", () => {
    expect(captureCommentDrift(regionAnchor("cap_1"), placed)).toBe("live");
  });

  test("is outdated when the anchor's capture is no longer placed", () => {
    expect(captureCommentDrift(regionAnchor("cap_9"), placed)).toBe("outdated");
  });

  test("is undefined for a non-capture anchor", () => {
    expect(captureCommentDrift(changeAnchor, placed)).toBeUndefined();
  });
});

describe("screenshotPins", () => {
  test("keeps only pins that carry a rect, numbering callouts and comments separately", () => {
    const callouts = [
      callout(
        regionAnchor("cap_1", [0.1, 0.1, 0.2, 0.2]),
        "callout with a rect"
      ),
      callout(regionAnchor("cap_1"), "whole callout"),
    ];
    const comments = [
      comment(
        regionAnchor("cap_1", [0.5, 0.5, 0.1, 0.1]),
        "comment with a rect"
      ),
    ];

    const regions = screenshotPins(callouts, comments, capture("cap_1"));

    expect(regions).toEqual([
      {
        body: "callout with a rect",
        label: "A1",
        rect: [0.1, 0.1, 0.2, 0.2],
      },
      {
        body: "comment with a rect",
        label: "C1",
        rect: [0.5, 0.5, 0.1, 0.1],
      },
    ]);
  });

  test("filters comments to the given capture, trusting callouts are already scoped to it by calloutsFor", () => {
    const comments = [
      comment(
        regionAnchor("cap_other", [0.5, 0.5, 0.1, 0.1]),
        "wrong capture, filtered out"
      ),
    ];

    const regions = screenshotPins([], comments, capture("cap_1"));

    expect(regions).toEqual([]);
  });
});

describe("recordingPins", () => {
  test("keeps only pins that carry an offset", () => {
    const callouts = [
      callout(timestampAnchor("cap_1", 1000, 2000), "seek callout"),
    ];
    const comments = [comment(timestampAnchor("cap_1"), "whole comment")];

    const times = recordingPins(callouts, comments, capture("cap_1"));

    expect(times).toEqual([
      {
        atMs: 1000,
        body: "seek callout",
        label: "A1",
        toMs: 2000,
      },
    ]);
  });
});

describe("captureCallouts", () => {
  test("carries the body of every screenshot pin, placed or not, under its overlay label", () => {
    const callouts = [
      callout(regionAnchor("cap_1", [0.1, 0.1, 0.2, 0.2]), "placed"),
      callout(regionAnchor("cap_1"), "unplaced"),
    ];
    const comments = [comment(regionAnchor("cap_1"), "a reviewer's note")];

    const labeled = captureCallouts(callouts, comments, capture("cap_1"));

    expect(labeled).toEqual([
      { body: "placed", label: "A1" },
      { body: "unplaced", label: "A2" },
      { body: "a reviewer's note", label: "C1" },
    ]);
  });

  test("reads a recording's pins through the timestamp arm", () => {
    const callouts = [callout(timestampAnchor("cap_1", 1000), "at one second")];

    const labeled = captureCallouts(
      callouts,
      [],
      capture("cap_1", "recording")
    );

    expect(labeled).toEqual([{ body: "at one second", label: "A1" }]);
  });
});

describe("calloutsFor", () => {
  test("keeps only the callouts whose capture-arm anchor targets the given capture", () => {
    const section = section_({
      callouts: [
        callout(regionAnchor("cap_1"), "on cap_1"),
        callout(regionAnchor("cap_2"), "on cap_2"),
        callout(changeAnchor, "not capture-anchored"),
      ],
    });

    const result = calloutsFor(section, "cap_1");

    expect(result.map((entry) => entry.body)).toEqual(["on cap_1"]);
  });

  test("an empty callouts list yields no matches", () => {
    const section = section_({});

    expect(calloutsFor(section, "cap_1")).toEqual([]);
  });
});
