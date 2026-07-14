import { describe, expect, test } from "bun:test";

import {
  foldCaptureSection,
  foldRangeSection,
  targetChipHref,
  targetChipIndex,
} from "./walkthrough-segments";

describe("targetChipIndex", () => {
  test("reads back the index a chip href carries", () => {
    expect(targetChipIndex(targetChipHref(3))).toBe(3);
  });

  test("ignores an ordinary link", () => {
    expect(targetChipIndex("https://example.com")).toBeUndefined();
  });

  test("ignores a fragment that only looks like a chip", () => {
    expect(targetChipIndex("#walkthrough-target-")).toBeUndefined();
  });
});

describe("foldRangeSection", () => {
  test("no markers leaves every range trailing the prose", () => {
    expect(foldRangeSection("The request enters here.", 2)).toEqual({
      placed: [],
      prose: "The request enters here.",
      trailing: [0, 1],
    });
  });

  test("rewrites a marker to its chip link in place", () => {
    const fold = foldRangeSection("Parsed here {{range:0}} then routed.", 1);

    expect(fold.prose).toBe(
      `Parsed here [](${targetChipHref(0)}) then routed.`
    );
    expect(fold.placed).toEqual([0]);
    expect(fold.trailing).toEqual([]);
  });

  test("keeps a marked paragraph whole", () => {
    const fold = foldRangeSection(
      "Opens here.\n\nThen {{range:0}} — rebuilt.",
      1
    );

    expect(fold.prose).toBe(
      `Opens here.\n\nThen [](${targetChipHref(0)}) — rebuilt.`
    );
  });

  test("leaves an out-of-range marker as literal prose", () => {
    expect(foldRangeSection("see {{range:5}}", 1)).toEqual({
      placed: [],
      prose: "see {{range:5}}",
      trailing: [0],
    });
  });

  test("trails the ranges no marker placed", () => {
    const fold = foldRangeSection("only {{range:1}} here", 3);

    expect(fold.placed).toEqual([1]);
    expect(fold.trailing).toEqual([0, 2]);
  });

  test("chips a range each time it is marked but places it once", () => {
    const fold = foldRangeSection("{{range:0}} and again {{range:0}}", 1);

    expect(fold.prose).toBe(
      `[](${targetChipHref(0)}) and again [](${targetChipHref(0)})`
    );
    expect(fold.placed).toEqual([0]);
  });

  test("a section with no ranges keeps its prose and trails nothing", () => {
    expect(foldRangeSection("just words", 0)).toEqual({
      placed: [],
      prose: "just words",
      trailing: [],
    });
  });
});

describe("foldCaptureSection", () => {
  test("rewrites a capture marker to its chip link in place", () => {
    const fold = foldCaptureSection(
      "Drag a file onto the dropzone {{capture:0}}.",
      1
    );

    expect(fold.prose).toBe(
      `Drag a file onto the dropzone [](${targetChipHref(0)}).`
    );
    expect(fold.placed).toEqual([0]);
  });

  test("leaves an out-of-range marker as literal prose", () => {
    expect(foldCaptureSection("see {{capture:5}}", 1)).toEqual({
      placed: [],
      prose: "see {{capture:5}}",
      trailing: [0],
    });
  });

  test("trails the captures no marker placed", () => {
    const fold = foldCaptureSection("only {{capture:1}} here", 3);

    expect(fold.placed).toEqual([1]);
    expect(fold.trailing).toEqual([0, 2]);
  });

  test("leaves the other kind's marker as prose", () => {
    const fold = foldCaptureSection("uses {{range:0}} not captures", 1);

    expect(fold.prose).toBe("uses {{range:0}} not captures");
    expect(fold.trailing).toEqual([0]);
  });
});
