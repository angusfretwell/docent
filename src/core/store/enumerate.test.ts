import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cleanupScratchDirs, scratchDir } from "@test-support/fixtures";
import { makeTestRuntime } from "@test-support/runtime";
import { Option } from "effect";

import {
  decodeFindingRecord,
  decodeWalkthroughSection,
  listFindingIds,
  listJsonRecordNames,
  listMarkdownRecordNames,
  listWalkthroughIds,
  readFindingRecord,
  readWalkthroughSection,
} from "./enumerate";

const runtime = makeTestRuntime();

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

describe("listJsonRecordNames", () => {
  test("lists only *.json entries, sorted", async () => {
    const dir = scratchDir("docent-enumerate-");
    writeFileSync(path.join(dir, "b.json"), "{}");
    writeFileSync(path.join(dir, "a.json"), "{}");
    writeFileSync(path.join(dir, "note.md"), "");

    const names = await runtime.runPromise(listJsonRecordNames(dir));

    expect(names).toEqual(["a.json", "b.json"]);
  });

  test("is [] for a directory that does not exist", async () => {
    const dir = scratchDir("docent-enumerate-");

    const names = await runtime.runPromise(
      listJsonRecordNames(path.join(dir, "absent"))
    );

    expect(names).toEqual([]);
  });
});

describe("listMarkdownRecordNames", () => {
  test("lists only *.md entries, sorted", async () => {
    const dir = scratchDir("docent-enumerate-");
    writeFileSync(path.join(dir, "002-reply.md"), "");
    writeFileSync(path.join(dir, "001-open.md"), "");
    writeFileSync(path.join(dir, "manifest.json"), "{}");

    const names = await runtime.runPromise(listMarkdownRecordNames(dir));

    expect(names).toEqual(["001-open.md", "002-reply.md"]);
  });
});

describe("listFindingIds", () => {
  test("lists only fnd_* directories, sorted", async () => {
    const dir = scratchDir("docent-enumerate-");
    mkdirSync(path.join(dir, "fnd_02"), { recursive: true });
    mkdirSync(path.join(dir, "fnd_01"), { recursive: true });
    mkdirSync(path.join(dir, "other"), { recursive: true });

    const ids = await runtime.runPromise(listFindingIds(dir));

    expect(ids).toEqual(["fnd_01", "fnd_02"]);
  });
});

describe("listWalkthroughIds", () => {
  test("lists only wlk_* directories, sorted", async () => {
    const dir = scratchDir("docent-enumerate-");
    mkdirSync(path.join(dir, "wlk_b"), { recursive: true });
    mkdirSync(path.join(dir, "wlk_a"), { recursive: true });

    const ids = await runtime.runPromise(listWalkthroughIds(dir));

    expect(ids).toEqual(["wlk_a", "wlk_b"]);
  });
});

const VALID_FINDING = [
  "---",
  "schema: docent/finding",
  'author: { kind: human, id: a@b.com, display: "A" }',
  "changeId: chg_001",
  "createdAt: 2026-07-10T02:14:00Z",
  "anchor: { kind: change }",
  "---",
  "",
  "a finding body",
  "",
].join("\n");

const MALFORMED_FINDING = "no frontmatter here\n";

describe("Finding record: decodeFindingRecord (strict) vs. readFindingRecord (best-effort)", () => {
  test("both entry points decode a well-formed record the same way", async () => {
    const dir = scratchDir("docent-enumerate-");
    const file = path.join(dir, "001-open.md");
    writeFileSync(file, VALID_FINDING);

    const strict = await runtime.runPromise(
      decodeFindingRecord(VALID_FINDING, "001-open.md")
    );
    const bestEffort = await runtime.runPromise(
      readFindingRecord(file, "001-open.md")
    );

    expect(strict.type).toBe("open");
    expect(Option.isSome(bestEffort) && bestEffort.value).toEqual(strict);
  });

  test("decodeFindingRecord fails on a malformed record — the failure validate's oracle reports", async () => {
    const exit = await runtime.runPromiseExit(
      decodeFindingRecord(MALFORMED_FINDING, "001-open.md")
    );

    expect(exit._tag).toBe("Failure");
  });

  test("readFindingRecord is None on the same malformed record — review's snapshot degrades gracefully", async () => {
    const dir = scratchDir("docent-enumerate-");
    const file = path.join(dir, "001-open.md");
    writeFileSync(file, MALFORMED_FINDING);

    const result = await runtime.runPromise(
      readFindingRecord(file, "001-open.md")
    );

    expect(Option.isNone(result)).toBe(true);
  });
});

const VALID_SECTION = [
  "---",
  "schema: docent/walkthrough-section",
  "id: sec_entry",
  'title: "Entry"',
  "ranges: []",
  "---",
  "",
  "the tour body",
  "",
].join("\n");

const MALFORMED_SECTION = "no frontmatter here\n";

describe("Walkthrough section: decodeWalkthroughSection (strict) vs. readWalkthroughSection (best-effort)", () => {
  test("both entry points decode a well-formed section the same way", async () => {
    const dir = scratchDir("docent-enumerate-");
    const file = path.join(dir, "s01-entry.md");
    writeFileSync(file, VALID_SECTION);

    const strict = await runtime.runPromise(
      decodeWalkthroughSection(VALID_SECTION)
    );
    const bestEffort = await runtime.runPromise(readWalkthroughSection(file));

    expect(strict.id).toBe("sec_entry");
    expect(Option.isSome(bestEffort) && bestEffort.value).toEqual(strict);
  });

  test("decodeWalkthroughSection fails on a malformed section — the failure validate's oracle reports", async () => {
    const exit = await runtime.runPromiseExit(
      decodeWalkthroughSection(MALFORMED_SECTION)
    );

    expect(exit._tag).toBe("Failure");
  });

  test("readWalkthroughSection is None on the same malformed section — review's snapshot degrades gracefully", async () => {
    const dir = scratchDir("docent-enumerate-");
    const file = path.join(dir, "s01-entry.md");
    writeFileSync(file, MALFORMED_SECTION);

    const result = await runtime.runPromise(readWalkthroughSection(file));

    expect(Option.isNone(result)).toBe(true);
  });
});
