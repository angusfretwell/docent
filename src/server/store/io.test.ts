import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime, Option, Schema } from "effect";

import { cleanupScratchDirs, scratchDir } from "../lib/test-fixtures";
import { listDir, readRecord } from "./io";

const runtime = ManagedRuntime.make(BunServices.layer);

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

const Widget = Schema.Struct({ count: Schema.Number, id: Schema.String });

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
