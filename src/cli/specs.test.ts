import { describe, expect, test } from "bun:test";

import { FindingId, WalkthroughId } from "@shared/schemas/ids";
import { Effect } from "effect";

import {
  parseDimensions,
  parseDurationMs,
  parseRangeSpec,
  parseRecordId,
} from "./specs";
import { CliUsageError } from "./usage";

function parsed<A>(parse: Effect.Effect<A, CliUsageError>): A {
  return Effect.runSync(parse);
}

function rejection<A>(parse: Effect.Effect<A, CliUsageError>): CliUsageError {
  return Effect.runSync(Effect.flip(parse));
}

describe("parseRecordId", () => {
  test("a well-formed id parses to its branded value", () => {
    expect(parsed(parseRecordId("finding", FindingId, " fnd_01H8 "))).toBe(
      FindingId.make("fnd_01H8")
    );
  });

  test("a blank or mis-prefixed id is a usage error", () => {
    expect(rejection(parseRecordId("finding", FindingId, "  "))).toBeInstanceOf(
      CliUsageError
    );
    expect(
      rejection(parseRecordId("walkthrough", WalkthroughId, "fnd_01H8"))
    ).toBeInstanceOf(CliUsageError);
  });
});

describe("parseRangeSpec", () => {
  test("file:start-end@side parses all parts", () => {
    expect(parsed(parseRangeSpec("src/index.ts:10-24@head"))).toEqual({
      file: "src/index.ts",
      lines: [10, 24],
      side: "head",
    });
  });

  test("side defaults to head and a single line widens to [n, n]", () => {
    expect(parsed(parseRangeSpec("src/parser.ts:40"))).toEqual({
      file: "src/parser.ts",
      lines: [40, 40],
      side: "head",
    });
  });

  test("the base side is selectable", () => {
    expect(parsed(parseRangeSpec("a.ts:5-9@base")).side).toBe("base");
  });

  test("a missing line span or bad side is a usage error", () => {
    expect(rejection(parseRangeSpec("src/index.ts"))).toBeInstanceOf(
      CliUsageError
    );
    expect(rejection(parseRangeSpec("src/index.ts:nope"))).toBeInstanceOf(
      CliUsageError
    );
    expect(rejection(parseRangeSpec("src/index.ts:1@sideways"))).toBeInstanceOf(
      CliUsageError
    );
  });
});

describe("parseDimensions", () => {
  test("WxH parses to a [w, h] tuple", () => {
    expect(parsed(parseDimensions("viewport", "1280x800"))).toEqual([
      1280, 800,
    ]);
  });

  test("a non-WxH value is a usage error", () => {
    expect(rejection(parseDimensions("viewport", "1280"))).toBeInstanceOf(
      CliUsageError
    );
    expect(rejection(parseDimensions("dims", "big"))).toBeInstanceOf(
      CliUsageError
    );
  });
});

describe("parseDurationMs", () => {
  test("a non-negative integer parses", () => {
    expect(parsed(parseDurationMs("8200"))).toBe(8200);
  });

  test("a non-integer or negative value is a usage error", () => {
    expect(rejection(parseDurationMs("foo"))).toBeInstanceOf(CliUsageError);
    expect(rejection(parseDurationMs("-5"))).toBeInstanceOf(CliUsageError);
    expect(rejection(parseDurationMs("1.5"))).toBeInstanceOf(CliUsageError);
  });
});
