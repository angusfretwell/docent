import { describe, expect, test } from "bun:test";

import type { CaptureKind } from "@shared/enums/capture-kind";
import type { Capture, WalkthroughSection } from "@shared/schemas/walkthrough";

import {
  captureLabel,
  capturesByKey,
  codeSteps,
  stepLayout,
  walkthroughPaths,
} from "./walkthrough";

function section(
  over: Partial<Omit<WalkthroughSection, "id" | "captures">> & {
    id?: string;
    captures?: readonly string[];
  } = {}
): WalkthroughSection {
  return {
    body: "",
    id: "sec_1",
    schema: "docent/walkthrough-section",
    title: "A section",
    ...over,
  } as unknown as WalkthroughSection;
}

function range(file: string, line: number) {
  return {
    blobSha: `sha-${file}`,
    file,
    lines: [line, line + 2] as [number, number],
    side: "head" as const,
  };
}

function layoutFor(over: Partial<WalkthroughSection>) {
  const [step] = codeSteps([section(over)]);

  if (step === undefined) {
    throw new Error("expected a step");
  }

  return stepLayout(step);
}

describe("stepLayout", () => {
  test("keeps a marked section's paragraph whole, chipping in place", () => {
    const layout = layoutFor({
      body: "Opens here.\n\nThen {{range:0}} rebuilds it.",
      ranges: [range("app.js", 9)],
    });

    expect(layout.prose).toContain("Then [](#walkthrough-target-0) rebuilds");
    expect(layout.heading).toBeUndefined();
    expect(layout.trailing).toEqual([]);
  });

  test("hoists an unmarked section's target to its heading", () => {
    const layout = layoutFor({
      body: "Prose with no markers.",
      ranges: [range("app.js", 9)],
    });

    expect(layout.heading).toBe("sec_1#0");
    expect(layout.trailing).toEqual([]);
  });

  test("leaves an unmarked section's later targets after the prose", () => {
    const layout = layoutFor({
      body: "Prose with no markers.",
      ranges: [range("app.js", 9), range("app.js", 20)],
    });

    expect(layout.heading).toBe("sec_1#0");
    expect(layout.trailing).toEqual(["sec_1#1"]);
  });

  test("does not hoist when a marker already placed a target", () => {
    const layout = layoutFor({
      body: "Only {{range:1}} is marked.",
      ranges: [range("app.js", 9), range("app.js", 20)],
    });

    expect(layout.heading).toBeUndefined();
    expect(layout.trailing).toEqual(["sec_1#0"]);
  });

  test("a section with no targets gets no chips at all", () => {
    const layout = layoutFor({ body: "Prose alone." });

    expect(layout.heading).toBeUndefined();
    expect(layout.trailing).toEqual([]);
  });
});

function capture(id: string, kind: CaptureKind, title?: string) {
  return {
    id,
    kind,
    media: `sha-${id}`,
    route: `/${id}`,
    viewport: [1280, 800] as [number, number],
    ...(title === undefined ? {} : { title }),
  } as unknown as Capture;
}

describe("capturesByKey", () => {
  test("drops a section's reference to a capture the registry does not hold", () => {
    const sections = [section({ captures: ["cap_missing"] })];

    const placed = capturesByKey(sections, []);

    expect(placed.size).toBe(0);
  });

  test("numbers each kind as its own run, in the order the tour reaches them", () => {
    const registry = [
      capture("cap_shot", "screenshot"),
      capture("cap_clip", "recording"),
      capture("cap_shot2", "screenshot"),
    ];
    const sections = [
      section({ captures: ["cap_shot", "cap_clip"], id: "sec_1" }),
      section({ captures: ["cap_shot2"], id: "sec_2" }),
    ];

    const placed = capturesByKey(sections, registry);

    expect([...placed.values()].map(captureLabel)).toEqual([
      "Screenshot 1",
      "Recording 1",
      "Screenshot 2",
    ]);
  });

  test("numbers captures across the whole tour regardless of kind", () => {
    const registry = [
      capture("cap_shot", "screenshot"),
      capture("cap_clip", "recording"),
      capture("cap_shot2", "screenshot"),
    ];
    const sections = [
      section({ captures: ["cap_shot", "cap_clip"], id: "sec_1" }),
      section({ captures: ["cap_shot2", "cap_clip"], id: "sec_2" }),
    ];

    const placed = capturesByKey(sections, registry);

    expect([...placed.values()].map((entry) => entry.ordinal)).toEqual([
      1, 2, 3, 2,
    ]);
  });

  test("keeps one number for a capture the prose returns to", () => {
    const registry = [capture("cap_shot", "screenshot")];
    const sections = [
      section({ captures: ["cap_shot"], id: "sec_1" }),
      section({ captures: ["cap_shot"], id: "sec_2" }),
    ];

    const placed = capturesByKey(sections, registry);

    expect([...placed.values()].map(captureLabel)).toEqual([
      "Screenshot 1",
      "Screenshot 1",
    ]);
  });
});

describe("captureLabel", () => {
  test("shows a capture's title in place of its ordinal", () => {
    const registry = [capture("cap_shot", "screenshot", "Empty palette")];
    const sections = [section({ captures: ["cap_shot"] })];

    const [placed] = capturesByKey(sections, registry).values();

    expect(placed && captureLabel(placed)).toBe("Empty palette");
  });

  test("falls back to kind and ordinal when a capture has no title", () => {
    const registry = [
      capture("cap_named", "screenshot", "Generating a palette"),
      capture("cap_bare", "screenshot"),
    ];
    const sections = [section({ captures: ["cap_named", "cap_bare"] })];

    const placed = capturesByKey(sections, registry);

    expect([...placed.values()].map(captureLabel)).toEqual([
      "Generating a palette",
      "Screenshot 2",
    ]);
  });
});

describe("walkthroughPaths", () => {
  test("collects each touched file once across sections", () => {
    const sections = [
      section({
        id: "sec_1",
        ranges: [range("app.js", 9), range("app.js", 20)],
      }),
      section({ id: "sec_2", ranges: [range("filter.js", 3)] }),
    ];

    const paths = walkthroughPaths(sections);

    expect([...paths].toSorted()).toEqual(["app.js", "filter.js"]);
  });
});
