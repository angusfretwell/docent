import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";
import type { Effect } from "effect";

import { materializeFixture } from "../../scripts/prepare-fixture.ts";
import { cleanupScratchDirs, scratchDir } from "./test-fixtures";
import { resolveStateRoot, validateStateRoot } from "./validate";

const runtime = ManagedRuntime.make(BunServices.layer);

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function run<A, E>(effect: Effect.Effect<A, E, BunServices.BunServices>) {
  return runtime.runPromise(effect);
}

const VALID_REVIEW = JSON.stringify({
  base: "main",
  branch: "feature",
  id: "rev_x",
  schema: "docent/review",
  title: "A feature",
});
const VALID_CHANGE = JSON.stringify({
  baseRef: "main",
  baseSha: "aaa",
  capturedAt: "2026-07-10T02:14:00Z",
  headRef: "feature",
  headSha: "bbb",
  id: "chg_001",
  schema: "docent/change",
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

/** Create `<root>/.docent/reviews/feature/` and return its absolute path. */
function reviewDir(root: string): string {
  const dir = path.join(root, ".docent", "reviews", "feature");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write `text` at `segments` under `dir`, creating parent directories. */
function writeUnder(dir: string, segments: string[], text: string): void {
  const file = path.join(dir, ...segments);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

describe("validateStateRoot", () => {
  test("a well-formed tree reports no problems", async () => {
    const root = scratchDir("docent-validate-");
    const dir = reviewDir(root);
    writeUnder(dir, ["review.json"], VALID_REVIEW);
    writeUnder(dir, ["changes", "chg_001.json"], VALID_CHANGE);
    writeUnder(dir, ["findings", "fnd_01", "001-open.md"], VALID_FINDING);

    const report = await run(validateStateRoot(path.join(root, ".docent")));

    expect(report.problems).toEqual([]);
    expect(report.checked).toBe(3);
  });

  test("reports a malformed JSON record, naming its path relative to the tree", async () => {
    const root = scratchDir("docent-validate-");
    const dir = reviewDir(root);
    writeUnder(dir, ["review.json"], VALID_REVIEW);
    writeUnder(dir, ["changes", "chg_001.json"], "{ not valid json");

    const report = await run(validateStateRoot(path.join(root, ".docent")));

    expect(report.checked).toBe(2);
    expect(report.problems.map((problem) => problem.file)).toEqual([
      path.join("reviews", "feature", "changes", "chg_001.json"),
    ]);
  });

  test("reports a record whose schema tag is wrong", async () => {
    const root = scratchDir("docent-validate-");
    const dir = reviewDir(root);
    writeUnder(
      dir,
      ["findings", "fnd_01", "001-open.md"],
      VALID_FINDING.replace("docent/finding", "docent/comment")
    );

    const report = await run(validateStateRoot(path.join(root, ".docent")));

    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]?.file).toBe(
      path.join("reviews", "feature", "findings", "fnd_01", "001-open.md")
    );
  });

  test("reports a walkthrough section that fails to decode", async () => {
    const root = scratchDir("docent-validate-");
    const dir = reviewDir(root);
    writeUnder(
      dir,
      ["walkthroughs", "code", "wlk_01", "manifest.json"],
      JSON.stringify({
        bornChangeId: "chg_001",
        id: "wlk_01",
        kind: "code",
        schema: "docent/walkthrough",
        sections: ["s01.md"],
        title: "T",
      })
    );
    writeUnder(
      dir,
      ["walkthroughs", "code", "wlk_01", "s01.md"],
      "no frontmatter here\n"
    );

    const report = await run(validateStateRoot(path.join(root, ".docent")));

    expect(report.problems.map((problem) => problem.file)).toEqual([
      path.join(
        "reviews",
        "feature",
        "walkthroughs",
        "code",
        "wlk_01",
        "s01.md"
      ),
    ]);
  });

  test("the committed fixture tree validates once materialized (the test oracle)", async () => {
    const target = scratchDir("docent-validate-fixture-");
    materializeFixture(target);

    const report = await run(validateStateRoot(path.join(target, ".docent")));

    expect(report.problems).toEqual([]);
    expect(report.checked).toBeGreaterThan(0);
  });
});

describe("resolveStateRoot", () => {
  test("finds .docent under a repo root", async () => {
    const root = scratchDir("docent-validate-");
    reviewDir(root);

    const resolved = await run(resolveStateRoot(root));

    expect(resolved).toBe(path.join(root, ".docent"));
  });

  test("treats a directory that directly holds reviews/ as the state root", async () => {
    const root = scratchDir("docent-validate-");
    const stateRoot = path.join(root, "docent");
    mkdirSync(path.join(stateRoot, "reviews"), { recursive: true });

    const resolved = await run(resolveStateRoot(stateRoot));

    expect(resolved).toBe(stateRoot);
  });

  test("accepts a path already named .docent", async () => {
    const root = scratchDir("docent-validate-");
    const stateRoot = path.join(root, ".docent");
    mkdirSync(stateRoot, { recursive: true });

    const resolved = await run(resolveStateRoot(stateRoot));

    expect(resolved).toBe(stateRoot);
  });
});
