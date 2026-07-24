import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { cleanupScratchDirs, git, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { readReviewSnapshot } from "../core/review";
import { WorkingDirectory } from "./usage";
import { walkthroughCommand } from "./walkthrough";

const runtime = makeTestRuntime();
const run = runtime.runPromise;

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

/** Run `docent walkthrough <argv>` the way the binary does, against `cwd`. */
function walkthrough(cwd: string, argv: readonly string[]) {
  return Command.runWith(walkthroughCommand, { version: "test" })(argv).pipe(
    Effect.provideService(WorkingDirectory, cwd)
  );
}

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

/** The single walkthrough in the Review (the tests create exactly one). */
async function onlyWalkthrough(root: string) {
  const snapshot = await run(
    readReviewSnapshot({ base: "main", branch: "feature", root })
  );
  return snapshot.walkthroughs.at(0);
}

/** The id of the single walkthrough in the Review. */
async function currentWalkthroughId(root: string): Promise<string> {
  const entry = await onlyWalkthrough(root);
  return entry?.id ?? "";
}

describe("docent walkthrough — end to end through git + fs", () => {
  test("create mints a code walkthrough bound to the live head's Change", async () => {
    const repo = featureRepo();

    await run(
      walkthrough(repo, ["create", "--kind", "code", "--title", "Code tour"])
    );

    const entry = await onlyWalkthrough(repo);
    expect(entry?.kind).toBe("code");
    expect(entry?.id).toMatch(/^wlk_/);
    expect(entry?.manifest?.bornChangeId as string).toBe("chg_001");
    expect(entry?.manifest?.title).toBe("Code tour");
  });

  test("create without --title mints a shell with an empty title", async () => {
    const repo = featureRepo();

    await run(walkthrough(repo, ["create", "--kind", "product"]));

    const entry = await onlyWalkthrough(repo);
    expect(entry?.kind).toBe("product");
    expect(entry?.manifest?.bornChangeId as string).toBe("chg_001");
    expect(entry?.manifest?.title).toBe("");
  });

  test("add-section resolves each --range's blobSha from git and appends the section", async () => {
    const repo = featureRepo();
    await run(
      walkthrough(repo, ["create", "--kind", "code", "--title", "Tour"])
    );
    const walkthroughId = await currentWalkthroughId(repo);

    await run(
      walkthrough(repo, [
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

  test("--range comma-joins as well as repeats", async () => {
    const repo = featureRepo();
    await run(
      walkthrough(repo, ["create", "--kind", "code", "--title", "Tour"])
    );
    const walkthroughId = await currentWalkthroughId(repo);

    await run(
      walkthrough(repo, [
        "add-section",
        "--walkthrough",
        walkthroughId,
        "--title",
        "Both files",
        "--range",
        "feature.ts:1,feature.ts:2",
        "--body",
        "Two ranges.",
      ])
    );

    const entry = await onlyWalkthrough(repo);
    expect(entry?.sections.at(0)?.ranges).toHaveLength(2);
  });

  test("a product tour takes capture ids and annotations on a section", async () => {
    const repo = featureRepo();
    await run(
      walkthrough(repo, [
        "create",
        "--kind",
        "product",
        "--title",
        "Product tour",
      ])
    );
    const walkthroughId = await currentWalkthroughId(repo);

    await run(
      walkthrough(repo, [
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
    expect(section?.captures as readonly string[] | undefined).toEqual([
      "cap_a",
      "cap_b",
    ]);
    expect(section?.annotations?.at(0)?.anchor.kind).toBe("screenshot-region");
  });

  test("an unknown subcommand fails, never a stray write", async () => {
    const repo = featureRepo();

    const exit = await runtime.runPromiseExit(
      walkthrough(repo, ["frobnicate"])
    );

    expect(exit._tag).toBe("Failure");
  });

  test("a malformed --range is refused before anything is written", async () => {
    const repo = featureRepo();
    await run(
      walkthrough(repo, ["create", "--kind", "code", "--title", "Tour"])
    );
    const walkthroughId = await currentWalkthroughId(repo);

    const exit = await runtime.runPromiseExit(
      walkthrough(repo, [
        "add-section",
        "--walkthrough",
        walkthroughId,
        "--title",
        "Bad",
        "--range",
        "nonsense",
        "--body",
        "x",
      ])
    );

    const entry = await onlyWalkthrough(repo);
    expect(exit._tag).toBe("Failure");
    expect(entry?.sections).toHaveLength(0);
  });
});
