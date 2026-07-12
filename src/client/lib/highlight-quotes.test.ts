import { describe, expect, test } from "bun:test";

import { highlightQuotes } from "./highlight-quotes";

describe("highlightQuotes", () => {
  test("text with no matching quotes returns unchanged as a single text segment", () => {
    const segments = highlightQuotes("plain prose here", ["missing"]);

    expect(segments).toEqual([{ kind: "text", text: "plain prose here" }]);
  });

  test("empty quotes are ignored even though every string contains the empty string", () => {
    const segments = highlightQuotes("plain prose", [""]);

    expect(segments).toEqual([{ kind: "text", text: "plain prose" }]);
  });

  test("a quote in the middle of the text splits into prefix, quote, and suffix segments", () => {
    const segments = highlightQuotes("before MIDDLE after", ["MIDDLE"]);

    expect(segments).toEqual([
      { kind: "text", text: "before " },
      { kind: "quote", text: "MIDDLE" },
      { kind: "text", text: " after" },
    ]);
  });

  test("a quote at the very start of the text has no leading text segment", () => {
    const segments = highlightQuotes("MIDDLE after", ["MIDDLE"]);

    expect(segments).toEqual([
      { kind: "quote", text: "MIDDLE" },
      { kind: "text", text: " after" },
    ]);
  });

  test("of two overlapping quotes, the earliest occurrence in the text wins", () => {
    const segments = highlightQuotes("aaa bbb ccc", ["ccc", "bbb"]);

    expect(segments).toEqual([
      { kind: "text", text: "aaa " },
      { kind: "quote", text: "bbb" },
      { kind: "text", text: " " },
      { kind: "quote", text: "ccc" },
    ]);
  });

  test("multiple non-overlapping quotes are each highlighted in order of appearance", () => {
    const segments = highlightQuotes("one two three", ["three", "one"]);

    expect(segments).toEqual([
      { kind: "quote", text: "one" },
      { kind: "text", text: " two " },
      { kind: "quote", text: "three" },
    ]);
  });
});
