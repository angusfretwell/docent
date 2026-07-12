import { describe, expect, test } from "bun:test";

import {
  interleaveCaptureSegments,
  interleaveSegments,
} from "./walkthrough-segments";

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
      interleaveSegments(
        "The request enters {{range:0}} and is parsed {{range:1}}.",
        2
      )
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
    expect(interleaveSegments("just words", 0)).toEqual([
      { kind: "prose", text: "just words" },
    ]);
  });
});

describe("interleaveCaptureSegments", () => {
  test("no markers renders prose then every capture in order", () => {
    expect(
      interleaveCaptureSegments("Drag a file onto the dropzone.", 2)
    ).toEqual([
      { kind: "prose", text: "Drag a file onto the dropzone." },
      { index: 0, kind: "capture" },
      { index: 1, kind: "capture" },
    ]);
  });

  test("markers interleave prose and captures in document order", () => {
    expect(
      interleaveCaptureSegments(
        "Drag {{capture:0}} and the upload begins {{capture:1}}.",
        2
      )
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
    expect(
      interleaveCaptureSegments("uses {{range:0}} not captures", 1)
    ).toEqual([
      { kind: "prose", text: "uses {{range:0}} not captures" },
      { index: 0, kind: "capture" },
    ]);
  });
});
