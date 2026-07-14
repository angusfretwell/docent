import { describe, expect, test } from "bun:test";

import {
  CliUsageError,
  many,
  one,
  parseArgs,
  parseEnum,
  requireFlag,
} from "./args";

describe("parseArgs", () => {
  test("splits --flag value, --flag=value, and bare booleans", () => {
    const parsed = parseArgs(
      ["--file", "a.ts", "--side=head", "--change"],
      new Set(["change"])
    );

    expect(parsed.values.get("file")).toEqual(["a.ts"]);
    expect(parsed.values.get("side")).toEqual(["head"]);
    expect(parsed.bools.has("change")).toBe(true);
  });

  test("accumulates a repeated flag", () => {
    const parsed = parseArgs(
      ["--status", "open", "--status", "resolved"],
      new Set()
    );

    expect(parsed.values.get("status")).toEqual(["open", "resolved"]);
  });

  test("rejects a stray positional", () => {
    expect(() => parseArgs(["oops"], new Set())).toThrow(CliUsageError);
  });
});

describe("parseEnum", () => {
  test("returns the value when it is one of the allowed set", () => {
    expect(parseEnum("side", "head", ["base", "head"])).toBe("head");
  });

  test("throws a CliUsageError naming the allowed values otherwise", () => {
    expect(() => parseEnum("side", "sideways", ["base", "head"])).toThrow(
      CliUsageError
    );
  });
});

describe("one", () => {
  test("returns the last value given for a repeated flag", () => {
    const parsed = parseArgs(["--tag", "a", "--tag", "b"], new Set());

    expect(one(parsed, "tag")).toBe("b");
  });

  test("is undefined when the flag was never given", () => {
    const parsed = parseArgs([], new Set());

    expect(one(parsed, "tag")).toBeUndefined();
  });
});

describe("many", () => {
  test("flattens repeated flags and comma-separated values together", () => {
    const parsed = parseArgs(["--tag", "a,b", "--tag", "c"], new Set());

    expect(many(parsed, "tag")).toEqual(["a", "b", "c"]);
  });

  test("is empty when the flag was never given", () => {
    const parsed = parseArgs([], new Set());

    expect(many(parsed, "tag")).toEqual([]);
  });
});

describe("requireFlag", () => {
  test("returns the trimmed value when the flag is present", () => {
    const parsed = parseArgs(["--name", " alice "], new Set());

    expect(requireFlag(parsed, "name")).toBe("alice");
  });

  test("throws a CliUsageError when the flag is missing or blank", () => {
    const missing = parseArgs([], new Set());
    const blank = parseArgs(["--name", "   "], new Set());

    expect(() => requireFlag(missing, "name")).toThrow(CliUsageError);
    expect(() => requireFlag(blank, "name")).toThrow(CliUsageError);
  });
});
