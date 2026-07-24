import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cleanupScratchDirs, scratchDir } from "@test-support/fixtures";
import { makeTestRuntime } from "@test-support/runtime";
import { Option, Schema } from "effect";

import { listDir, readRecord, writeJsonRecord } from "./io";

const runtime = makeTestRuntime();

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

const Widget = Schema.Struct({ count: Schema.Number, id: Schema.String });

// A record whose `at` encodes to a string and decodes to a `Date` — the
// asymmetry a write that skipped the schema would silently break.
const Stamped = Schema.Struct({
  at: Schema.DateFromString,
  id: Schema.String,
});

describe("readRecord", () => {
  test("decodes a well-formed JSON file against the schema", async () => {
    const root = scratchDir("docent-io-");
    const file = path.join(root, "widget.json");
    writeFileSync(file, JSON.stringify({ count: 3, id: "w1" }));

    const result = await runtime.runPromise(readRecord(file, Widget));

    expect(Option.isSome(result) && result.value).toEqual({
      count: 3,
      id: "w1",
    });
  });

  test("is None for a missing file", async () => {
    const root = scratchDir("docent-io-");

    const result = await runtime.runPromise(
      readRecord(path.join(root, "absent.json"), Widget)
    );

    expect(Option.isNone(result)).toBe(true);
  });

  test("is None for malformed JSON", async () => {
    const root = scratchDir("docent-io-");
    const file = path.join(root, "broken.json");
    writeFileSync(file, "{ not valid json");

    const result = await runtime.runPromise(readRecord(file, Widget));

    expect(Option.isNone(result)).toBe(true);
  });

  test("is None when the JSON fails to decode against the schema", async () => {
    const root = scratchDir("docent-io-");
    const file = path.join(root, "wrong-shape.json");
    writeFileSync(file, JSON.stringify({ id: "w1" }));

    const result = await runtime.runPromise(readRecord(file, Widget));

    expect(Option.isNone(result)).toBe(true);
  });
});

describe("writeJsonRecord", () => {
  test("writes canonical 2-space JSON with a trailing newline", async () => {
    const root = scratchDir("docent-io-");
    const file = path.join(root, "widget.json");
    const value = { count: 3, id: "w1" };

    await runtime.runPromise(writeJsonRecord(file, Widget, value));

    expect(readFileSync(file, "utf-8")).toBe(
      `${JSON.stringify(value, null, 2)}\n`
    );
  });

  test("round-trips through readRecord", async () => {
    const root = scratchDir("docent-io-");
    const file = path.join(root, "widget.json");
    const value = { count: 3, id: "w1" };

    await runtime.runPromise(writeJsonRecord(file, Widget, value));
    const result = await runtime.runPromise(readRecord(file, Widget));

    expect(Option.isSome(result) && result.value).toEqual(value);
  });

  test("round-trips a field whose encoded form differs from its decoded one", async () => {
    const root = scratchDir("docent-io-");
    const file = path.join(root, "stamped.json");
    const value = { at: new Date("2026-01-02T03:04:05.000Z"), id: "w1" };

    await runtime.runPromise(writeJsonRecord(file, Stamped, value));
    const result = await runtime.runPromise(readRecord(file, Stamped));

    expect(Option.isSome(result) && result.value).toEqual(value);
  });
});

describe("listDir", () => {
  test("lists a directory's entries", async () => {
    const root = scratchDir("docent-io-");
    mkdirSync(path.join(root, "sub"), { recursive: true });
    writeFileSync(path.join(root, "sub", "a.json"), "{}");
    writeFileSync(path.join(root, "sub", "b.json"), "{}");

    const names = await runtime.runPromise(listDir(path.join(root, "sub")));

    expect(names.toSorted()).toEqual(["a.json", "b.json"]);
  });

  test("is [] for a directory that does not exist", async () => {
    const root = scratchDir("docent-io-");

    const names = await runtime.runPromise(listDir(path.join(root, "absent")));

    expect(names).toEqual([]);
  });
});
