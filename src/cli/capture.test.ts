import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cleanupScratchDirs, git, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { readReviewSnapshot } from "../core/review";
import { captureCommand } from "./capture";
import { WorkingDirectory } from "./usage";
import { walkthroughCommand } from "./walkthrough";

const runtime = makeTestRuntime();
const run = runtime.runPromise;

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function capture(cwd: string, argv: readonly string[]) {
  return Command.runWith(captureCommand, { version: "test" })(argv).pipe(
    Effect.provideService(WorkingDirectory, cwd)
  );
}

function walkthrough(cwd: string, argv: readonly string[]) {
  return Command.runWith(walkthroughCommand, { version: "test" })(argv).pipe(
    Effect.provideService(WorkingDirectory, cwd)
  );
}

async function productRepo(): Promise<{
  media: string;
  walkthroughId: string;
  root: string;
}> {
  const root = scratchRepo("docent-cap-cli-");
  git(root, "checkout", "-b", "feature");
  writeFileSync(path.join(root, "feature.ts"), "export const x = 1;\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "add feature");
  writeFileSync(path.join(root, "shot.rrweb.json"), '[{"type":4},{"type":2}]');

  await run(walkthrough(root, ["create", "--kind", "product", "--title", "T"]));
  const snapshot = await run(
    readReviewSnapshot({ base: "main", branch: "feature", root })
  );

  return {
    media: "shot.rrweb.json",
    root,
    walkthroughId: snapshot.walkthroughs.at(0)?.id ?? "",
  };
}

function onlyWalkthrough(root: string) {
  return run(
    readReviewSnapshot({ base: "main", branch: "feature", root })
  ).then((snapshot) => snapshot.walkthroughs.at(0));
}

describe("docent capture add — end to end", () => {
  test("content-addresses the media file and registers it on the product tour", async () => {
    const { media, root, walkthroughId } = await productRepo();

    await run(
      capture(root, [
        "add",
        "--walkthrough",
        walkthroughId,
        "--kind",
        "screenshot",
        "--media",
        media,
        "--route",
        "/signup",
        "--viewport",
        "1280x800",
        "--dims",
        "1280x2400",
      ])
    );

    const entry = await onlyWalkthrough(root);
    const registered = entry?.manifest?.captures?.at(0);
    expect(registered?.kind).toBe("screenshot");
    expect(registered?.media).toMatch(/^[0-9a-f]{64}$/);
    expect(registered?.dims).toEqual([1280, 2400]);
    const blob = path.join(
      root,
      ".docent",
      "reviews",
      "feature",
      "walkthroughs",
      "product",
      walkthroughId,
      "captures",
      `${registered?.media}.rrweb.json`
    );
    expect(existsSync(blob)).toBe(true);
  });

  test("--title is recorded on the capture entry", async () => {
    const { media, root, walkthroughId } = await productRepo();

    await run(
      capture(root, [
        "add",
        "--walkthrough",
        walkthroughId,
        "--kind",
        "screenshot",
        "--media",
        media,
        "--route",
        "/signup",
        "--viewport",
        "1280x800",
        "--dims",
        "1280x2400",
        "--title",
        "Empty signup form",
      ])
    );

    const entry = await onlyWalkthrough(root);
    expect(entry?.manifest?.captures?.at(0)?.title).toBe("Empty signup form");
  });

  test("--duration-ms on a screenshot (or --dims on a recording) is refused", async () => {
    const { media, root, walkthroughId } = await productRepo();

    const wrongDuration = await runtime.runPromiseExit(
      capture(root, [
        "add",
        "--walkthrough",
        walkthroughId,
        "--kind",
        "screenshot",
        "--media",
        media,
        "--route",
        "/",
        "--viewport",
        "1x1",
        "--duration-ms",
        "8200",
      ])
    );
    const wrongDims = await runtime.runPromiseExit(
      capture(root, [
        "add",
        "--walkthrough",
        walkthroughId,
        "--kind",
        "recording",
        "--media",
        media,
        "--route",
        "/",
        "--viewport",
        "1x1",
        "--dims",
        "1x2",
      ])
    );

    const entry = await onlyWalkthrough(root);
    expect(wrongDuration._tag).toBe("Failure");
    expect(wrongDims._tag).toBe("Failure");
    expect(entry?.manifest?.captures ?? []).toHaveLength(0);
  });

  test("the stored blob carries the app's assets, not urls into it", async () => {
    const font = new Uint8Array([119, 79, 70, 50, 9]);
    const server = Bun.serve({
      fetch: () =>
        new Response(font, { headers: { "content-type": "font/woff2" } }),
      port: 0,
    });
    const { root, walkthroughId } = await productRepo();
    const media = "styled.rrweb.json";
    writeFileSync(
      path.join(root, media),
      JSON.stringify([
        { data: { href: `http://localhost:${server.port}/` }, type: 4 },
        {
          data: {
            node: {
              attributes: {
                _cssText: `@font-face{src:url("http://localhost:${server.port}/f.woff2")}`,
              },
              childNodes: [],
              id: 3,
              tagName: "style",
              type: 2,
            },
          },
          type: 2,
        },
      ])
    );

    await run(
      capture(root, [
        "add",
        "--walkthrough",
        walkthroughId,
        "--kind",
        "screenshot",
        "--media",
        media,
        "--route",
        "/",
        "--viewport",
        "1280x800",
        "--dims",
        "1280x800",
      ])
    );
    server.stop(true);

    const entry = await onlyWalkthrough(root);
    const blob = await Bun.file(
      path.join(
        root,
        ".docent",
        "reviews",
        "feature",
        "walkthroughs",
        "product",
        walkthroughId,
        "captures",
        `${entry?.manifest?.captures?.at(0)?.media}.rrweb.json`
      )
    ).text();
    expect(blob).toContain(
      `data:font/woff2;base64,${Buffer.from(font).toString("base64")}`
    );
    expect(blob).not.toContain("f.woff2");
  });

  test("a missing media file is a usage error", async () => {
    const { root, walkthroughId } = await productRepo();

    const exit = await runtime.runPromiseExit(
      capture(root, [
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
