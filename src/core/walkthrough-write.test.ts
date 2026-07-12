import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";

import { readReviewSnapshot } from "./review";
import { cleanupScratchDirs, scratchDir } from "./test-fixtures";
import {
  addWalkthroughCapture,
  addWalkthroughSection,
  writeWalkthrough,
} from "./walkthrough-write";

const runtime = ManagedRuntime.make(BunServices.layer);
const run = runtime.runPromise;

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

const REFS = {
  baseRef: "main",
  baseSha: "aaaa",
  headRef: "feature",
  headSha: "bbbb",
};
const base = { base: "main", branch: "feature" };

function reviewDir(root: string) {
  return path.join(root, ".docent", "reviews", "feature");
}

function create(root: string, kind: "code" | "product", title: string) {
  return run(writeWalkthrough({ ...base, kind, refs: REFS, root, title }));
}

function snapshot(root: string) {
  return run(readReviewSnapshot({ ...base, root }));
}

function walkthrough(root: string, id: string) {
  return snapshot(root).then((snap) =>
    snap.walkthroughs.find((entry) => entry.id === id)
  );
}

describe("writeWalkthrough", () => {
  test("mints a wlk_ id and binds bornChangeId to the live head's Change", async () => {
    const root = scratchDir("docent-wlk-");

    const result = await create(root, "code", "Entry & dispatch");

    expect(result.walkthroughId).toMatch(/^wlk_/);
    expect(result.changeId).toBe("chg_001");

    const entry = await walkthrough(root, result.walkthroughId);
    expect(entry?.kind).toBe("code");
    expect(entry?.manifest?.bornChangeId).toBe("chg_001");
    expect(entry?.manifest?.title).toBe("Entry & dispatch");
    expect(entry?.manifest?.sections).toEqual([]);
    expect(entry?.manifest?.captures).toBeUndefined();
  });

  test("reuses the Change for the same head — no second mint", async () => {
    const root = scratchDir("docent-wlk-");

    const first = await create(root, "code", "One");
    const second = await create(root, "product", "Two");

    expect(second.changeId).toBe(first.changeId);
    const snap = await snapshot(root);
    expect(snap.changes.map((change) => change.id)).toEqual(["chg_001"]);
  });
});

describe("addWalkthroughSection", () => {
  test("mints a sec_ id, writes an ordered section file, and appends it to the manifest", async () => {
    const root = scratchDir("docent-wlk-");
    const { walkthroughId } = await create(root, "code", "Code tour");

    const first = await run(
      addWalkthroughSection({
        ...base,
        body: "The request enters here {{range:0}}.",
        ranges: [
          {
            blobSha: "9c2a",
            file: "src/index.ts",
            lines: [10, 24],
            side: "head",
          },
        ],
        root,
        title: "Entry point",
        walkthroughId,
      })
    );
    const second = await run(
      addWalkthroughSection({
        ...base,
        body: "Then dispatch.",
        root,
        title: "Dispatch",
        walkthroughId,
      })
    );

    expect(first.sectionId).toMatch(/^sec_/);
    expect(first.section).toBe("s01-entry-point.md");
    expect(second.section).toBe("s02-dispatch.md");

    const entry = await walkthrough(root, walkthroughId);
    expect(entry?.manifest?.sections).toEqual([
      "s01-entry-point.md",
      "s02-dispatch.md",
    ]);
    expect(entry?.sections.map((section) => section.title)).toEqual([
      "Entry point",
      "Dispatch",
    ]);
    expect(entry?.sections.at(0)?.id).toBe(first.sectionId);
    expect(entry?.sections.at(0)?.ranges?.at(0)?.file).toBe("src/index.ts");
    expect(entry?.sections.at(0)?.body).toBe(
      "The request enters here {{range:0}}."
    );
  });

  test("writes the product arm — captures and annotations", async () => {
    const root = scratchDir("docent-wlk-");
    const { walkthroughId } = await create(root, "product", "Product tour");

    const { section } = await run(
      addWalkthroughSection({
        ...base,
        annotations: [
          {
            anchor: {
              capture: "cap_a",
              kind: "screenshot-region",
              rect: [0.1, 0.2, 0.3, 0.1],
            },
            body: "The upload control.",
          },
        ],
        body: "Drag a file {{capture:0}}.",
        captureIds: ["cap_a", "cap_b"],
        root,
        title: "Uploading",
        walkthroughId,
      })
    );

    expect(section).toBe("s01-uploading.md");
    const entry = await walkthrough(root, walkthroughId);
    expect(entry?.sections.at(0)?.captures).toEqual(["cap_a", "cap_b"]);
    expect(entry?.sections.at(0)?.annotations?.at(0)?.anchor.kind).toBe(
      "screenshot-region"
    );
  });

  test("an unknown walkthrough id is an error, never a stray write", async () => {
    const root = scratchDir("docent-wlk-");

    const exit = await runtime.runPromiseExit(
      addWalkthroughSection({
        ...base,
        body: "x",
        root,
        title: "T",
        walkthroughId: "wlk_nope",
      })
    );

    expect(exit._tag).toBe("Failure");
  });

  test("a range on a product tour is refused (wrong arm)", async () => {
    const root = scratchDir("docent-wlk-");
    const { walkthroughId } = await create(root, "product", "Product tour");

    const exit = await runtime.runPromiseExit(
      addWalkthroughSection({
        ...base,
        body: "x",
        ranges: [
          {
            blobSha: "9c2a",
            file: "src/index.ts",
            lines: [1, 2],
            side: "head",
          },
        ],
        root,
        title: "T",
        walkthroughId,
      })
    );

    expect(exit._tag).toBe("Failure");
  });

  test("captures/annotations on a code tour are refused (wrong arm)", async () => {
    const root = scratchDir("docent-wlk-");
    const { walkthroughId } = await create(root, "code", "Code tour");

    const exit = await runtime.runPromiseExit(
      addWalkthroughSection({
        ...base,
        body: "x",
        captureIds: ["cap_a"],
        root,
        title: "T",
        walkthroughId,
      })
    );

    expect(exit._tag).toBe("Failure");
  });
});

describe("addWalkthroughCapture", () => {
  test("content-addresses the media and appends a captures[] registry entry", async () => {
    const root = scratchDir("docent-wlk-");
    const { walkthroughId } = await create(root, "product", "Product tour");

    const png = new TextEncoder().encode("fake-png-bytes");
    const result = await run(
      addWalkthroughCapture({
        ...base,
        dims: [1280, 2400],
        kind: "screenshot",
        media: png,
        root,
        route: "/signup",
        viewport: [1280, 800],
        walkthroughId,
      })
    );

    expect(result.captureId).toMatch(/^cap_/);
    expect(result.media).toMatch(/^[0-9a-f]{64}$/);

    const blob = path.join(
      reviewDir(root),
      "walkthroughs",
      "product",
      walkthroughId,
      "captures",
      `${result.media}.png`
    );
    expect(existsSync(blob)).toBe(true);

    const entry = await walkthrough(root, walkthroughId);
    expect(entry?.manifest?.captures?.at(0)).toMatchObject({
      dims: [1280, 2400],
      id: result.captureId,
      kind: "screenshot",
      media: result.media,
      route: "/signup",
      viewport: [1280, 800],
    });
  });

  test("byte-identical media dedups to one blob but two registry entries", async () => {
    const root = scratchDir("docent-wlk-");
    const { walkthroughId } = await create(root, "product", "Product tour");
    const bytes = new TextEncoder().encode("same-bytes");

    const first = await run(
      addWalkthroughCapture({
        ...base,
        kind: "screenshot",
        media: bytes,
        root,
        route: "/a",
        viewport: [1, 2],
        walkthroughId,
      })
    );
    const second = await run(
      addWalkthroughCapture({
        ...base,
        kind: "screenshot",
        media: bytes,
        root,
        route: "/b",
        viewport: [1, 2],
        walkthroughId,
      })
    );

    expect(second.media).toBe(first.media);
    const captureDir = path.join(
      reviewDir(root),
      "walkthroughs",
      "product",
      walkthroughId,
      "captures"
    );
    expect(readdirSync(captureDir)).toEqual([`${first.media}.png`]);

    const entry = await walkthrough(root, walkthroughId);
    expect(entry?.manifest?.captures?.map((capture) => capture.id)).toEqual([
      first.captureId,
      second.captureId,
    ]);
  });

  test("a recording writes a .rrweb.json blob with durationMs", async () => {
    const root = scratchDir("docent-wlk-");
    const { walkthroughId } = await create(root, "product", "Product tour");

    const result = await run(
      addWalkthroughCapture({
        ...base,
        durationMs: 8200,
        kind: "recording",
        media: new TextEncoder().encode("[]"),
        root,
        route: "/signup",
        viewport: [1280, 800],
        walkthroughId,
      })
    );

    const blob = path.join(
      reviewDir(root),
      "walkthroughs",
      "product",
      walkthroughId,
      "captures",
      `${result.media}.rrweb.json`
    );
    expect(existsSync(blob)).toBe(true);
    const entry = await walkthrough(root, walkthroughId);
    expect(entry?.manifest?.captures?.at(0)).toMatchObject({
      durationMs: 8200,
      kind: "recording",
    });
  });

  test("registering a capture on a code walkthrough is refused", async () => {
    const root = scratchDir("docent-wlk-");
    const { walkthroughId } = await create(root, "code", "Code tour");

    const exit = await runtime.runPromiseExit(
      addWalkthroughCapture({
        ...base,
        kind: "screenshot",
        media: new TextEncoder().encode("x"),
        root,
        route: "/",
        viewport: [1, 2],
        walkthroughId,
      })
    );

    expect(exit._tag).toBe("Failure");
  });
});
