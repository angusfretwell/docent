import { describe, expect, test } from "bun:test";

import { parseDimensions, parseDurationMs, parseRangeSpec } from "./specs";
import { CliUsageError } from "./usage";

describe("parseRangeSpec", () => {
  test("file:start-end@side parses all parts", () => {
    expect(parseRangeSpec("src/index.ts:10-24@head")).toEqual({
      file: "src/index.ts",
      lines: [10, 24],
      side: "head",
    });
  });

  test("side defaults to head and a single line widens to [n, n]", () => {
    expect(parseRangeSpec("src/parser.ts:40")).toEqual({
      file: "src/parser.ts",
      lines: [40, 40],
      side: "head",
    });
  });

  test("the base side is selectable", () => {
    expect(parseRangeSpec("a.ts:5-9@base").side).toBe("base");
  });

  test("a missing line span or bad side is a usage error", () => {
    expect(() => parseRangeSpec("src/index.ts")).toThrow(CliUsageError);
    expect(() => parseRangeSpec("src/index.ts:nope")).toThrow(CliUsageError);
    expect(() => parseRangeSpec("src/index.ts:1@sideways")).toThrow(
      CliUsageError
    );
  });
});

describe("parseDimensions", () => {
  test("WxH parses to a [w, h] tuple", () => {
    expect(parseDimensions("viewport", "1280x800")).toEqual([1280, 800]);
  });

  test("a non-WxH value is a usage error", () => {
    expect(() => parseDimensions("viewport", "1280")).toThrow(CliUsageError);
    expect(() => parseDimensions("dims", "big")).toThrow(CliUsageError);
  });
});

describe("parseDurationMs", () => {
  test("a non-negative integer parses", () => {
    expect(parseDurationMs("8200")).toBe(8200);
  });

  test("a non-integer or negative value is a usage error", () => {
    expect(() => parseDurationMs("foo")).toThrow(CliUsageError);
    expect(() => parseDurationMs("-5")).toThrow(CliUsageError);
    expect(() => parseDurationMs("1.5")).toThrow(CliUsageError);
  });
});
