import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ManagedRuntime, Schema } from "effect";
import { Change, DiffError } from "../shared/change.ts";
import { DossierSnapshot } from "../shared/dossier.ts";
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
const decodeSnapshot = Schema.decodeUnknownSync(DossierSnapshot);

afterAll(async () => {
  await Promise.all(disposers.map((dispose) => dispose()));
  cleanupScratchDirs();
});

/** Read the next SSE chunk as text, failing loudly rather than hanging forever. */
async function readSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
): Promise<string> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("timed out waiting for an SSE frame")),
      3000,
    );
  });
  const { value, done } = await Promise.race([reader.read(), timeout]);
  return done || value === undefined ? "" : decoder.decode(value);
}

/** A scratch repo on branch `feature` with one committed change off `main`. */
function featureRepo(): string {
  const dir = scratchRepo("docent-serve-test-");
  git(dir, "checkout", "-b", "feature");
  writeFileSync(join(dir, "feature.txt"), "new file\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "add feature file");
  return dir;
}

/** A stub built-client directory. */
function scratchClientDir(): string {
  const dir = scratchDir("docent-client-test-");
  writeFileSync(
    join(dir, "index.html"),
    "<!doctype html><title>docent</title>",
  );
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "app.js"), "console.log('app');\n");
  writeFileSync(join(dir, "..", "secret.txt"), "top secret\n");
  return dir;
}

/**
 * The reachable form of the server's base URL. Bun reports `localhost`, but some
 * sandboxes only route one loopback family — probe `/` and fall back to the
 * IPv6/IPv4 literal so the suite runs regardless of how loopback resolves.
 */
async function reachableBase(url: string): Promise<string> {
  const candidates = [
    url,
    url.replace("localhost", "[::1]"),
    url.replace("localhost", "127.0.0.1"),
  ];
  for (const candidate of candidates) {
    try {
      await fetch(new URL("/", candidate));
      return candidate;
    } catch {
      // Try the next loopback form.
    }
  }
  return url;
}

/** Boot the server layer and return its base URL; torn down in afterAll. */
async function serve(repo: string): Promise<{ url: string }> {
  const runtime = ManagedRuntime.make(
    layer({ clientDir: scratchClientDir(), cwd: repo }),
  );
  disposers.push(() => runtime.dispose());
  const url = await runtime.runPromise(serverUrl);
  return { url: await reachableBase(url) };
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
    writeFileSync(join(repo, "second.txt"), "second\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "second commit");

    const body = decodeChange(
      await (await fetch(new URL("/api/diff", url))).json(),
    );

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

  test("GET /api/dossier auto-creates and returns the branch's snapshot", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);

    const res = await fetch(new URL("/api/dossier", url));

    expect(res.status).toBe(200);
    const snap = decodeSnapshot(await res.json());
    expect(snap.dossier.schema).toBe("docent/dossier@3");
    expect(snap.dossier.branch).toBe("feature");
    expect(snap.dossier.base).toBe("main");
    expect(
      existsSync(join(repo, ".docent", "dossiers", "feature", "dossier.json")),
    ).toBe(true);
  });

  test("GET /api/events pushes a change when .docent/ is written externally", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);
    const controller = new AbortController();
    const res = await fetch(new URL("/api/events", url), {
      signal: controller.signal,
    });
    const body = res.body;
    if (!body) {
      throw new Error("SSE response had no body");
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();

    try {
      // The opening comment confirms the stream is live before we write.
      expect(await readSse(reader, decoder)).toContain("connected");
      // An external agent dropping a record file into `.docent/`, not a UI write.
      writeFileSync(join(repo, ".docent", "external.txt"), "hi\n");

      expect(await readSse(reader, decoder)).toContain("dossier-changed");
    } finally {
      // Close the socket so the server's graceful shutdown doesn't wait on it.
      controller.abort();
    }
  });
});
