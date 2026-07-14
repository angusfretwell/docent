import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";

import { readReviewSnapshot } from "../core/review";
import { cleanupScratchDirs, git, scratchRepo } from "../core/test-fixtures";
import { CliUsageError } from "./args";
import {
  parseDimensions,
  parseDurationMs,
  parseRangeSpec,
  runCapture,
  runWalkthrough,
} from "./walkthrough";

const runtime = ManagedRuntime.make(BunServices.layer);
const run = runtime.runPromise;

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

/** A scratch repo on `feature`, one file changed off `main`. */
function featureRepo(): string {
  const dir = scratchRepo("docent-wlk-cli-");
  git(dir, "checkout", "-b", "feature");
  writeFileSync(
    path.join(dir, "feature.ts"),
    "export const x = 1;\nexport const y = 2;\n"
  );
  git(dir, "add", ".");
  git(dir, "commit", "-m", "add feature");
  return dir;
}

function snapshot(root: string) {
  return run(readReviewSnapshot({ base: "main", branch: "feature", root }));
}

/** The single walkthrough in the Review (the tests create exactly one). */
async function onlyWalkthrough(root: string) {
  const snap = await snapshot(root);
  return snap.walkthroughs.at(0);
}

/** The id of the single walkthrough in the Review. */
async function currentWalkthroughId(root: string): Promise<string> {
  const entry = await onlyWalkthrough(root);
  return entry?.id ?? "";
}

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

describe("runWalkthrough — end to end through git + fs", () => {
  test("create mints a code walkthrough bound to the live head's Change", async () => {
    const repo = featureRepo();

    await run(
      runWalkthrough(repo, ["create", "--kind", "code", "--title", "Code tour"])
    );

    const entry = await onlyWalkthrough(repo);
    expect(entry?.kind).toBe("code");
    expect(entry?.id).toMatch(/^wlk_/);
    expect(entry?.manifest?.bornChangeId).toBe("chg_001");
    expect(entry?.manifest?.title).toBe("Code tour");
  });

  test("create without --title mints a shell with an empty title", async () => {
    const repo = featureRepo();

    await run(runWalkthrough(repo, ["create", "--kind", "product"]));

    const entry = await onlyWalkthrough(repo);
    expect(entry?.kind).toBe("product");
    expect(entry?.manifest?.bornChangeId).toBe("chg_001");
    expect(entry?.manifest?.title).toBe("");
  });

  test("add-section resolves each --range's blobSha from git and appends the section", async () => {
    const repo = featureRepo();
    await run(
      runWalkthrough(repo, ["create", "--kind", "code", "--title", "Tour"])
    );
    const created = await onlyWalkthrough(repo);
    const walkthroughId = created?.id ?? "";

    await run(
      runWalkthrough(repo, [
        "add-section",
        "--walkthrough",
        walkthroughId,
        "--title",
        "Entry point",
        "--range",
        "feature.ts:1-2@head",
        "--body",
        "The values live here {{range:0}}.",
      ])
    );

    const entry = await onlyWalkthrough(repo);
    expect(entry?.manifest?.sections).toEqual(["s01-entry-point.md"]);
    const section = entry?.sections.at(0);
    expect(section?.title).toBe("Entry point");
    expect(section?.ranges?.at(0)?.file).toBe("feature.ts");
    expect(section?.ranges?.at(0)?.blobSha).toMatch(/^[0-9a-f]{40}/);
    expect(section?.body).toBe("The values live here {{range:0}}.");
  });

  test("a product tour takes capture ids and annotations on a section", async () => {
    const repo = featureRepo();
    await run(
      runWalkthrough(repo, [
        "create",
        "--kind",
        "product",
        "--title",
        "Product tour",
      ])
    );
    const walkthroughId = await currentWalkthroughId(repo);

    await run(
      runWalkthrough(repo, [
        "add-section",
        "--walkthrough",
        walkthroughId,
        "--title",
        "Uploading",
        "--capture",
        "cap_a,cap_b",
        "--annotation",
        JSON.stringify({
          anchor: {
            capture: "cap_a",
            kind: "screenshot-region",
            rect: [0.1, 0.2, 0.3, 0.1],
          },
          body: "The upload control.",
        }),
        "--body",
        "Drag a file {{capture:0}}.",
      ])
    );

    const uploaded = await onlyWalkthrough(repo);
    const section = uploaded?.sections.at(0);
    expect(section?.captures).toEqual(["cap_a", "cap_b"]);
    expect(section?.annotations?.at(0)?.anchor.kind).toBe("screenshot-region");
  });

  test("an unknown subcommand fails, never a stray write", async () => {
    const repo = featureRepo();
    const exit = await runtime.runPromiseExit(
      runWalkthrough(repo, ["frobnicate"])
    );
    expect(exit._tag).toBe("Failure");
  });
});

describe("runCapture — end to end", () => {
  test("add content-addresses a media file and registers it on the product tour", async () => {
    const repo = featureRepo();
    await run(
      runWalkthrough(repo, [
        "create",
        "--kind",
        "product",
        "--title",
        "Product tour",
      ])
    );
    const walkthroughId = await currentWalkthroughId(repo);
    writeFileSync(
      path.join(repo, "shot.rrweb.json"),
      '[{"type":4},{"type":2}]'
    );

    await run(
      runCapture(repo, [
        "add",
        "--walkthrough",
        walkthroughId,
        "--kind",
        "screenshot",
        "--media",
        "shot.rrweb.json",
        "--route",
        "/signup",
        "--viewport",
        "1280x800",
        "--dims",
        "1280x2400",
      ])
    );

    const entry = await onlyWalkthrough(repo);
    const capture = entry?.manifest?.captures?.at(0);
    expect(capture?.kind).toBe("screenshot");
    expect(capture?.media).toMatch(/^[0-9a-f]{64}$/);
    expect(capture?.dims).toEqual([1280, 2400]);
    const blob = path.join(
      repo,
      ".docent",
      "reviews",
      "feature",
      "walkthroughs",
      "product",
      walkthroughId,
      "captures",
      `${capture?.media}.rrweb.json`
    );
    expect(existsSync(blob)).toBe(true);
  });

  test("--title is recorded on the capture entry", async () => {
    const repo = featureRepo();
    await run(
      runWalkthrough(repo, ["create", "--kind", "product", "--title", "Tour"])
    );
    const walkthroughId = await currentWalkthroughId(repo);
    writeFileSync(
      path.join(repo, "shot.rrweb.json"),
      '[{"type":4},{"type":2}]'
    );

    await run(
      runCapture(repo, [
        "add",
        "--walkthrough",
        walkthroughId,
        "--kind",
        "screenshot",
        "--media",
        "shot.rrweb.json",
        "--route",
        "/",
        "--viewport",
        "1280x800",
        "--dims",
        "1280x2400",
        "--title",
        "Empty signup form",
      ])
    );

    const entry = await onlyWalkthrough(repo);
    expect(entry?.manifest?.captures?.at(0)?.title).toBe("Empty signup form");
  });

  test("--duration-ms on a screenshot (or --dims on a recording) is refused", async () => {
    const repo = featureRepo();
    await run(
      runWalkthrough(repo, ["create", "--kind", "product", "--title", "T"])
    );
    const walkthroughId = await currentWalkthroughId(repo);
    writeFileSync(path.join(repo, "shot.rrweb.json"), "bytes");

    const wrongDuration = await runtime.runPromiseExit(
      runCapture(repo, [
        "add",
        "--walkthrough",
        walkthroughId,
        "--kind",
        "screenshot",
        "--media",
        "shot.rrweb.json",
        "--route",
        "/",
        "--viewport",
        "1x1",
        "--duration-ms",
        "8200",
      ])
    );
    const wrongDims = await runtime.runPromiseExit(
      runCapture(repo, [
        "add",
        "--walkthrough",
        walkthroughId,
        "--kind",
        "recording",
        "--media",
        "shot.rrweb.json",
        "--route",
        "/",
        "--viewport",
        "1x1",
        "--dims",
        "1x2",
      ])
    );

    expect(wrongDuration._tag).toBe("Failure");
    expect(wrongDims._tag).toBe("Failure");
  });

  test("a missing media file is a usage error", async () => {
    const repo = featureRepo();
    await run(
      runWalkthrough(repo, ["create", "--kind", "product", "--title", "T"])
    );
    const walkthroughId = await currentWalkthroughId(repo);

    const exit = await runtime.runPromiseExit(
      runCapture(repo, [
        "add",
        "--walkthrough",
        walkthroughId,
        "--kind",
        "screenshot",
        "--media",
        "nope.rrweb.json",
        "--route",
        "/",
        "--viewport",
        "1x1",
      ])
    );
    expect(exit._tag).toBe("Failure");
  });
});
