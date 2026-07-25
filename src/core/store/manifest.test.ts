import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { WalkthroughKind } from "@shared/enums/walkthrough-kind";
import { ChangeId, WalkthroughId } from "@shared/schemas/ids";
import { Walkthrough } from "@shared/schemas/walkthrough";
import { cleanupScratchDirs, scratchDir } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import {
  appendToManifest,
  assertSectionArms,
  loadWalkthrough,
  walkthroughDir,
  writeManifest,
} from "./manifest";

const runtime = makeTestRuntime();
const run = runtime.runPromise;

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function manifest(overrides: Partial<typeof Walkthrough.Type> = {}) {
  return Walkthrough.make({
    bornChangeId: ChangeId.make("chg_001"),
    id: WalkthroughId.make("wlk_test"),
    kind: "product",
    schema: "docent/walkthrough",
    sections: [],
    title: "A tour",
    ...overrides,
  });
}

function seed(root: string, kind: WalkthroughKind, initial: Walkthrough) {
  return run(
    Effect.gen(function* seedManifest() {
      const fs = yield* FileSystem;
      const path_ = yield* Path;
      const reviewDir = path_.join(root, "review");
      const dir = walkthroughDir(path_, reviewDir, kind, initial.id);
      yield* fs.makeDirectory(dir, { recursive: true });
      yield* writeManifest(dir, initial);
      return { dir, reviewDir };
    })
  );
}

describe("assertSectionArms", () => {
  test("a range on a product tour is rejected", () => {
    const mismatch = assertSectionArms(
      "product",
      { hasProduct: false, hasRanges: true },
      "wlk_test"
    );

    expect(mismatch?.arm).toBe("--range");
    expect(mismatch?.kind).toBe("product");
    expect(mismatch?.id).toBe("wlk_test");
  });

  test("a capture/callout on a code tour is rejected", () => {
    const mismatch = assertSectionArms(
      "code",
      { hasProduct: true, hasRanges: false },
      "wlk_test"
    );

    expect(mismatch?.arm).toBe("--capture/--callout");
    expect(mismatch?.kind).toBe("code");
  });

  test("matching (or absent) arms pass", () => {
    expect(
      assertSectionArms("code", { hasProduct: false, hasRanges: true }, "id")
    ).toBeUndefined();
    expect(
      assertSectionArms("product", { hasProduct: true, hasRanges: false }, "id")
    ).toBeUndefined();
    expect(
      assertSectionArms("code", { hasProduct: false, hasRanges: false }, "id")
    ).toBeUndefined();
    expect(
      assertSectionArms(
        "product",
        { hasProduct: false, hasRanges: false },
        "id"
      )
    ).toBeUndefined();
  });
});

describe("loadWalkthrough", () => {
  test("locates a walkthrough by id, searching both pillars", async () => {
    const root = scratchDir("docent-manifest-");
    const { dir } = await seed(root, "product", manifest());

    const loaded = await run(
      loadWalkthrough(path.join(root, "review"), WalkthroughId.make("wlk_test"))
    );

    expect(loaded.dir).toBe(dir);
    expect(loaded.manifest.title).toBe("A tour");
    expect(loaded.manifest.kind).toBe("product");
  });

  test("fails with WalkthroughNotFound for an unknown id", async () => {
    const root = scratchDir("docent-manifest-");

    const exit = await runtime.runPromiseExit(
      loadWalkthrough(
        path.join(root, "review"),
        WalkthroughId.make("wlk_missing")
      )
    );

    expect(exit._tag).toBe("Failure");
  });
});

describe("writeManifest", () => {
  test("writes canonical 2-space JSON with a trailing newline", async () => {
    const root = scratchDir("docent-manifest-");
    const { dir } = await seed(root, "code", manifest({ kind: "code" }));

    const bytes = readFileSync(path.join(dir, "manifest.json"), "utf-8");

    expect(bytes).toBe(
      `${JSON.stringify(manifest({ kind: "code" }), null, 2)}\n`
    );
  });
});

describe("appendToManifest", () => {
  test("mutates and persists — a later load reflects the update", async () => {
    const root = scratchDir("docent-manifest-");
    await seed(root, "product", manifest());
    const reviewDir = path.join(root, "review");
    const loaded = await run(
      loadWalkthrough(reviewDir, WalkthroughId.make("wlk_test"))
    );

    const updated = await run(
      appendToManifest(loaded, (current) =>
        Walkthrough.make({
          ...current,
          sections: [...current.sections, "s01-first.md"],
        })
      )
    );

    expect(updated.sections).toEqual(["s01-first.md"]);
    const reloaded = await run(
      loadWalkthrough(reviewDir, WalkthroughId.make("wlk_test"))
    );
    expect(reloaded.manifest.sections).toEqual(["s01-first.md"]);
  });
});
