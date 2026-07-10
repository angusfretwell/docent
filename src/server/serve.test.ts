import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ManagedRuntime } from "effect";
import type { RepoDiff } from "./git.ts";
import { layer, serverUrl } from "./serve.ts";

const scratchDirs: string[] = [];
const disposers: (() => Promise<void>)[] = [];

const NOT_A_GIT_REPO = /not a git repository/i;

afterAll(async () => {
  await Promise.all(disposers.map((dispose) => dispose()));
  for (const dir of scratchDirs) {
    rmSync(dir, { force: true, recursive: true });
  }
});

function git(cwd: string, ...args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], { cwd });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr.toString()}`
    );
  }
}

/** A scratch repo on branch `feature` with one committed change off `main`. */
function scratchRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "docent-serve-test-"));
  scratchDirs.push(dir);
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "hello.txt"), "hello\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "initial");
  git(dir, "checkout", "-b", "feature");
  writeFileSync(join(dir, "feature.txt"), "new file\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "add feature file");
  return dir;
}

/** A stub built-client directory. */
function scratchClientDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "docent-client-test-"));
  scratchDirs.push(dir);
  writeFileSync(
    join(dir, "index.html"),
    "<!doctype html><title>docent</title>"
  );
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "app.js"), "console.log('app');\n");
  writeFileSync(join(dir, "..", "secret.txt"), "top secret\n");
  return dir;
}

/** Boot the server layer and return its base URL; torn down in afterAll. */
async function serve(repo: string): Promise<{ url: string }> {
  const runtime = ManagedRuntime.make(
    layer({ clientDir: scratchClientDir(), cwd: repo })
  );
  disposers.push(() => runtime.dispose());
  const url = await runtime.runPromise(serverUrl);
  return { url };
}

describe("server layer", () => {
  test("GET /api/diff returns the live branch diff as JSON", async () => {
    const repo = scratchRepo();
    const { url } = await serve(repo);

    const res = await fetch(new URL("/api/diff", url));

    expect(res.status).toBe(200);
    const body = (await res.json()) as RepoDiff;
    expect(body.branch).toBe("feature");
    expect(body.defaultBranch).toBe("main");
    expect(body.patch).toContain("+new file");
  });

  test("the diff renders live from git on every load", async () => {
    const repo = scratchRepo();
    const { url } = await serve(repo);
    await fetch(new URL("/api/diff", url));
    writeFileSync(join(repo, "second.txt"), "second\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "second commit");

    const body = (await (
      await fetch(new URL("/api/diff", url))
    ).json()) as RepoDiff;

    expect(body.patch).toContain("second.txt");
  });

  test("serves the client index at / and static assets by path", async () => {
    const { url } = await serve(scratchRepo());

    const index = await fetch(url);
    const asset = await fetch(new URL("/assets/app.js", url));

    expect(index.status).toBe(200);
    expect(await index.text()).toContain("docent");
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain("console.log");
  });

  test("404s unknown paths and blocks path traversal out of the client dir", async () => {
    const { url } = await serve(scratchRepo());

    const missing = await fetch(new URL("/nope.js", url));
    const traversal = await fetch(`${url}assets/%2e%2e/%2e%2e/secret.txt`);

    expect(missing.status).toBe(404);
    expect(traversal.status).toBe(404);
  });

  test("500s /api/diff with the error when the cwd is not a git repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "docent-serve-test-"));
    scratchDirs.push(dir);
    const { url } = await serve(dir);

    const res = await fetch(new URL("/api/diff", url));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(NOT_A_GIT_REPO);
  });
});
