import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ManagedRuntime, Schema } from "effect";
import { assetsFromManifest } from "../client/assets.ts";
import type { ClientAssets } from "../client/assets.ts";
import { Change, DiffError } from "../shared/change.ts";
import { DossierSnapshot } from "../shared/dossier.ts";
import { FindingWriteResult } from "../shared/finding-write.ts";
import { foldFinding } from "../shared/finding.ts";
import { Pending } from "../shared/pending.ts";
import { layer, serverUrl } from "./serve.ts";
import { cleanupScratchDirs, git, scratchDir, scratchRepo } from "./test-fixtures.ts";

const disposers: (() => Promise<void>)[] = [];

// Sync decode boundary: bun:test assertions are synchronous by design.
const decodeChange = Schema.decodeUnknownSync(Change);
const decodeDiffError = Schema.decodeUnknownSync(DiffError);
const decodeSnapshot = Schema.decodeUnknownSync(DossierSnapshot);
const decodePending = Schema.decodeUnknownSync(Pending);
const decodeWriteResult = Schema.decodeUnknownSync(FindingWriteResult);

afterAll(async () => {
  await Promise.all(disposers.map((dispose) => dispose()));
  cleanupScratchDirs();
});

/** Read the next SSE chunk as text, failing loudly rather than hanging forever. */
async function readSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
): Promise<string> {
  // Generous: under full-suite load every server runs recursive fs watches, and
  // macOS FSEvents can delay a frame well past a second. This only guards
  // against a truly hung stream, so a high ceiling costs nothing when frames flow.
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("timed out waiting for an SSE frame")), 10_000);
  });
  const { value, done } = await Promise.race([reader.read(), timeout]);
  return done || value === undefined ? "" : decoder.decode(value);
}

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
  const runtime = ManagedRuntime.make(layer({ assets: scratchClientAssets(), cwd: repo }));
  disposers.push(() => runtime.dispose());
  const url = await runtime.runPromise(serverUrl);
  return { url: await reachableBase(url) };
}

function postFinding(url: string, body: unknown): Promise<Response> {
  return fetch(new URL("/api/findings", url), {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

/** Fetch and decode the live Dossier snapshot. */
async function fetchDossier(url: string) {
  const res = await fetch(new URL("/api/dossier", url));
  return decodeSnapshot(await res.json());
}

const lineAnchor = {
  blobSha: "9c2a1f0",
  file: "feature.txt",
  kind: "line",
  lines: [1, 1],
  side: "head",
};

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
    expect(body.error).toMatch(/not a git repository/i);
  });

  test("GET /api/blob/:sha returns the raw blob bytes with cache-forever headers", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);
    const sha = git(repo, "rev-parse", "HEAD:feature.txt");

    const res = await fetch(new URL(`/api/blob/${sha}`, url));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("new file\n");
    // Content-addressed → immutable → cache forever.
    expect(res.headers.get("cache-control")).toMatch(/immutable/);
    expect(res.headers.get("cache-control")).toMatch(/max-age=31536000/);
  });

  test("GET /api/blob/:sha 404s an object id that is not in the repo", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);

    const res = await fetch(new URL("/api/blob/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", url));

    expect(res.status).toBe(404);
  });

  test("GET /api/blob/:sha 400s a malformed object id", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);

    const res = await fetch(new URL("/api/blob/not-a-sha", url));

    expect(res.status).toBe(400);
  });

  test("GET /api/pending returns the dirty working-tree preview as JSON", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);
    writeFileSync(path.join(repo, "feature.txt"), "new file\nplus an edit\n");
    writeFileSync(path.join(repo, "fresh.txt"), "untracked\n");

    const res = await fetch(new URL("/api/pending", url));

    expect(res.status).toBe(200);
    const body = decodePending(await res.json());
    expect(body.dirty).toBe(true);
    expect(body.range).toBe("incremental");
    expect(body.patch).toContain("+plus an edit");
    expect(body.patch).toContain("fresh.txt");
  });

  test("GET /api/pending is not dirty on a clean tree", async () => {
    const repo = featureRepo();
    // docent's boot writes `.docent/` and its `.gitignore` entry; committing a
    // `.gitignore` that already ignores `.docent/` keeps the boot a no-op so the
    // tree stays genuinely clean.
    writeFileSync(path.join(repo, ".gitignore"), ".docent/\n");
    git(repo, "add", ".gitignore");
    git(repo, "commit", "-m", "ignore .docent");
    const { url } = await serve(repo);

    const res = await fetch(new URL("/api/pending", url));

    const body = decodePending(await res.json());
    expect(body.dirty).toBe(false);
    expect(body.patch).toBe("");
  });

  test("GET /api/pending?range=cumulative previews base..worktree", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);
    writeFileSync(path.join(repo, "working.txt"), "uncommitted\n");

    const res = await fetch(new URL("/api/pending?range=cumulative", url));

    const body = decodePending(await res.json());
    expect(body.range).toBe("cumulative");
    // The committed feature file plus the uncommitted working file.
    expect(body.patch).toContain("feature.txt");
    expect(body.patch).toContain("working.txt");
  });

  test("GET /api/worktree reads live working-tree bytes, explicitly uncached", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);
    writeFileSync(path.join(repo, "feature.txt"), "edited live on disk\n");

    const res = await fetch(new URL("/api/worktree?path=feature.txt", url));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("edited live on disk\n");
    // The working tree is mutable — never cache it.
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  test("GET /api/worktree 400s a path that escapes the repo root", async () => {
    const { url } = await serve(featureRepo());

    const res = await fetch(new URL("/api/worktree?path=../../../etc/passwd", url));

    expect(res.status).toBe(400);
  });

  test("GET /api/worktree 404s a path that does not exist", async () => {
    const { url } = await serve(featureRepo());

    const res = await fetch(new URL("/api/worktree?path=nope.txt", url));

    expect(res.status).toBe(404);
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
    expect(existsSync(path.join(repo, ".docent", "dossiers", "feature", "dossier.json"))).toBe(
      true,
    );
  });

  test("POST /api/viewed appends an event the dossier snapshot then reports", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);

    const post = await fetch(new URL("/api/viewed", url), {
      body: JSON.stringify({ blobSha: "9c2a1f0", path: "feature.txt" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(post.status).toBe(200);
    const event = await post.json();
    expect(event).toMatchObject({ blobSha: "9c2a1f0", path: "feature.txt" });
    const dossier = await fetch(new URL("/api/dossier", url));
    const snap = decodeSnapshot(await dossier.json());
    expect(snap.viewed).toEqual([{ blobSha: "9c2a1f0", path: "feature.txt", ts: event.ts }]);
  });

  test("POST /api/viewed 400s a malformed body", async () => {
    const { url } = await serve(featureRepo());

    const res = await fetch(new URL("/api/viewed", url), {
      body: JSON.stringify({ nope: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(400);
  });

  test("POST /api/findings opens a Finding, minting the head's Change", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);

    const res = await postFinding(url, {
      anchor: lineAnchor,
      body: "the flush races the mark",
      op: "open",
    });

    expect(res.status).toBe(200);
    const result = decodeWriteResult(await res.json());
    expect(result.findingId).toMatch(/^fnd_/);
    expect(result.record).toBe("001-open.md");
    expect(result.changeId).toBe("chg_001");

    // The record and its minted Change are both visible in the live snapshot.
    const snap = await fetchDossier(url);
    expect(snap.changes.map((change) => change.id)).toEqual(["chg_001"]);
    const finding = snap.findings.find((entry) => entry.id === result.findingId);
    const folded = foldFinding(result.findingId, finding?.records ?? []);
    expect(folded.body).toBe("the flush races the mark");
    expect(folded.anchor).toMatchObject({ file: "feature.txt", kind: "line" });
    // Attribution is the human resolved from git config, never gating.
    expect(finding?.records.at(0)?.author).toMatchObject({ kind: "human" });
  });

  test("POST /api/findings appends a reply to an existing Finding", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);
    const openRes = await postFinding(url, { anchor: lineAnchor, body: "flagged", op: "open" });
    const opened = decodeWriteResult(await openRes.json());

    const res = await postFinding(url, {
      body: "fixed",
      disposition: "actioned",
      findingId: opened.findingId,
      op: "reply",
    });

    expect(res.status).toBe(200);
    expect(decodeWriteResult(await res.json()).record).toBe("002-reply.md");
    const snap = await fetchDossier(url);
    const finding = snap.findings.find((entry) => entry.id === opened.findingId);
    expect(foldFinding(opened.findingId, finding?.records ?? []).whatsNext).toBe("needs-verify");
  });

  test("POST /api/findings 400s a malformed body", async () => {
    const { url } = await serve(featureRepo());

    const res = await postFinding(url, { op: "nonsense" });

    expect(res.status).toBe(400);
  });

  test("GET /api/events pushes a change when .docent/ is written externally", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);
    const controller = new AbortController();
    const res = await fetch(new URL("/api/events", url), {
      signal: controller.signal,
    });
    const { body } = res;
    if (!body) {
      throw new Error("SSE response had no body");
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();

    try {
      // The opening comment confirms the stream is live before we write.
      expect(await readSse(reader, decoder)).toContain("connected");
      // An external agent dropping a record file into `.docent/`, not a UI write.
      writeFileSync(path.join(repo, ".docent", "external.txt"), "hi\n");

      expect(await readSse(reader, decoder)).toContain("dossier-changed");
    } finally {
      // Close the socket so the server's graceful shutdown doesn't wait on it.
      controller.abort();
    }
  });

  test("GET /api/events pushes a change when a working-tree file is edited", async () => {
    const repo = featureRepo();
    const { url } = await serve(repo);
    const controller = new AbortController();
    const res = await fetch(new URL("/api/events", url), { signal: controller.signal });
    const { body } = res;
    if (!body) {
      throw new Error("SSE response had no body");
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();

    try {
      expect(await readSse(reader, decoder)).toContain("connected");
      // An agent editing a tracked file in the working tree — the Pending diff's
      // live-refresh trigger, rooted at the repo, not `.docent/`.
      writeFileSync(path.join(repo, "feature.txt"), "edited by an agent\n");

      expect(await readSse(reader, decoder)).toContain("dossier-changed");
    } finally {
      controller.abort();
    }
  });
});
