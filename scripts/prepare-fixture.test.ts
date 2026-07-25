import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readReviewSnapshot } from "@core/review";
import { reviewDirPath } from "@core/store/layout";
import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";
import { sum } from "radashi";

import { cleanupScratchDirs, scratchDir } from "../src/test/fixtures.ts";
import { materializeFixture } from "./prepare-fixture.ts";

const runtime = ManagedRuntime.make(BunServices.layer);

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

/** Every file path under `dir`, recursively; `[]` when `dir` is absent. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/** The `wlk_*` directories under both walkthrough kinds — one snapshot entry each. */
function walkthroughDirs(reviewDir: string): string[] {
  const dirs: string[] = [];
  for (const kind of ["code", "product"] as const) {
    const kindDir = path.join(reviewDir, "walkthroughs", kind);
    if (!existsSync(kindDir)) {
      continue;
    }
    for (const entry of readdirSync(kindDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith("wlk_")) {
        dirs.push(path.join(kindDir, entry.name));
      }
    }
  }
  return dirs;
}

/** Count every append-only `.docent/` record materialized under a Review dir. */
function recordCountsOnDisk(reviewDir: string) {
  function withExtension(sub: string, extension: string): string[] {
    return filesUnder(path.join(reviewDir, sub)).filter((file) =>
      file.endsWith(extension)
    );
  }
  return {
    changes: withExtension("changes", ".json").length,
    commentRecords: withExtension("comments", ".md").length,
    viewed: withExtension("viewed", ".json").length,
    walkthroughSections: withExtension("walkthroughs", ".md").length,
    walkthroughs: walkthroughDirs(reviewDir).length,
  };
}

describe("dev fixture", () => {
  // The snapshot reader is the parse oracle (@see docs/spec/testing.md): it
  // reads the whole dossier through the shared Effect schemas but is best-effort
  // — a record it cannot decode is silently skipped, never fatal. So validity is
  // asserted as parity: every record materialized on disk must survive into the
  // snapshot. Fixture drift against the data model therefore fails CI instead of
  // silently breaking `bun dev`.
  test("every materialized record reads back through the snapshot reader", async () => {
    const root = scratchDir("docent-fixture-");
    const { branch } = materializeFixture(root);
    const reviewDir = reviewDirPath(root, branch);
    // Capture the fixture's own review.json id BEFORE the reader runs: ensureReview
    // rewrites review.json with a freshly minted id whenever it can't decode the
    // existing one, so a read afterwards would tautologically match the snapshot.
    // Comparing the snapshot to the pre-read id makes a drifted review.json fail.
    const fixtureReviewId = JSON.parse(
      readFileSync(path.join(reviewDir, "review.json"), "utf-8")
    ).id;

    const snap = await runtime.runPromise(
      readReviewSnapshot({ base: "main", branch, root })
    );

    const onDisk = recordCountsOnDisk(reviewDir);
    expect({
      changes: snap.changes.length,
      commentRecords: sum(snap.comments, (comment) => comment.records.length),
      viewed: snap.viewed.length,
      walkthroughSections: sum(
        snap.walkthroughs,
        (walkthrough) => walkthrough.sections.length
      ),
      walkthroughs: snap.walkthroughs.length,
    }).toEqual(onDisk);
    // Guard against a vacuous 0 === 0 parity if the fixture ever stops emitting a
    // record kind — the walkthrough especially (a core rich-fixture element).
    expect(onDisk.changes).toBeGreaterThan(0);
    expect(onDisk.commentRecords).toBeGreaterThan(0);
    expect(onDisk.viewed).toBeGreaterThan(0);
    expect(onDisk.walkthroughs).toBeGreaterThan(0);
    expect(onDisk.walkthroughSections).toBeGreaterThan(0);
    // The single `review.json` sits outside the append-only dirs: assert the
    // reader parsed the fixture's record rather than auto-creating a fresh one.
    expect(snap.review.id).toBe(fixtureReviewId);
  });

  test("a malformed record is dropped, so validation catches fixture drift", async () => {
    const root = scratchDir("docent-fixture-");
    const { branch } = materializeFixture(root);
    const reviewDir = reviewDirPath(root, branch);
    writeFileSync(
      path.join(reviewDir, "changes", "chg_001.json"),
      "{ not valid json"
    );

    const snap = await runtime.runPromise(
      readReviewSnapshot({ base: "main", branch, root })
    );

    expect(snap.changes.length).toBe(recordCountsOnDisk(reviewDir).changes - 1);
  });
});
