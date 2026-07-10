import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ManagedRuntime, Schema } from "effect";
import { assetsFromManifest } from "../client/assets.ts";
import type { ClientAssets } from "../client/assets.ts";
import { Change, DiffError } from "../shared/change.ts";
import { layer, serverUrl } from "./serve.ts";
import {
  cleanupScratchDirs,
  git,
  NOT_A_GIT_REPO,
  scratchDir,
  scratchRepo,
} from "./test-fixtures.ts";

const disposers: (() => Promise<void>)[] = [];

// Sync decode boundary: bun:test assertions are synchronous by design.
const decodeChange = Schema.decodeUnknownSync(Change);
const decodeDiffError = Schema.decodeUnknownSync(DiffError);

afterAll(async () => {
  await Promise.all(disposers.map((dispose) => dispose()));
  cleanupScratchDirs();
});

/** A scratch repo on branch `feature` with one committed change off `main`. */
function featureRepo(): string {
  const dir = scratchRepo("docent-serve-test-");
  git(dir, "checkout", "-b", "feature");
  writeFileSync(path.join(dir, "feature.txt"), "new file\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "add feature file");
  return dir;
}

/** A stub built-client asset map backed by real files (what `Bun.file` reads). */
function scratchClientAssets(): ClientAssets {
  const dir = scratchDir("docent-client-test-");
  const indexPath = path.join(dir, "index.html");
  const appPath = path.join(dir, "app.js");
  writeFileSync(indexPath, "<!doctype html><title>docent</title>");
  writeFileSync(appPath, "console.log('app');\n");
  writeFileSync(path.join(dir, "secret.txt"), "top secret\n");
  return assetsFromManifest([
    { file: indexPath, path: "/index.html" },
    { file: appPath, path: "/assets/app.js" },
  ]);
}

/** Boot the server layer and return its base URL; torn down in afterAll. */
async function serve(repo: string): Promise<{ url: string }> {
  const runtime = ManagedRuntime.make(layer({ assets: scratchClientAssets(), cwd: repo }));
  disposers.push(() => runtime.dispose());
  const url = await runtime.runPromise(serverUrl);
  return { url };
}

describe("server layer", () => {
  test("GET /api/diff returns the live branch diff as JSON", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);

    const res = await fetch(new URL("/api/diff", url));

    expect(res.status).toBe(200);
    const body = decodeChange(await res.json());
    expect(body.branch).toBe("feature");
    expect(body.defaultBranch).toBe("main");
    expect(body.patch).toContain("+new file");
  });

  test("the diff renders live from git on every load", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);
    await fetch(new URL("/api/diff", url));
    writeFileSync(path.join(repo, "second.txt"), "second\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "second commit");

    const res = await fetch(new URL("/api/diff", url));
    const body = decodeChange(await res.json());

    expect(body.patch).toContain("second.txt");
  });

  test("serves the client index at / and static assets by path", async () => {
    const { url } = await serve(featureRepo());

    const index = await fetch(url);
    const asset = await fetch(new URL("/assets/app.js", url));

    expect(index.status).toBe(200);
    expect(await index.text()).toContain("docent");
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain("console.log");
  });

  test("404s unknown paths and blocks path traversal out of the client dir", async () => {
    const { url } = await serve(featureRepo());

    const missing = await fetch(new URL("/nope.js", url));
    const traversal = await fetch(`${url}assets/%2e%2e/%2e%2e/secret.txt`);

    expect(missing.status).toBe(404);
    expect(traversal.status).toBe(404);
  });

  test("500s /api/diff with the error when the cwd is not a git repo", async () => {
    const dir = scratchDir("docent-serve-test-");
    const { url } = await serve(dir);

    const res = await fetch(new URL("/api/diff", url));

    expect(res.status).toBe(500);
    const body = decodeDiffError(await res.json());
    expect(body.error).toMatch(NOT_A_GIT_REPO);
  });
});
