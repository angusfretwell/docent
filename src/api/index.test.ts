import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { foldFinding } from "@shared/lib/finding";
import { Change, DiffError } from "@shared/schemas/change";
import { FindingWriteResult } from "@shared/schemas/finding-write";
import { Pending } from "@shared/schemas/pending";
import { ReviewSnapshot } from "@shared/schemas/review";
import {
  cleanupScratchDirs,
  git,
  scratchDir,
  scratchRepo,
} from "@test/fixtures";
import { Schema } from "effect";

import { webHandler } from "./index";

const disposers: (() => Promise<void>)[] = [];

// Sync decode boundary: bun:test assertions are synchronous by design.
const decodeChange = Schema.decodeUnknownSync(Change);
const decodeDiffError = Schema.decodeUnknownSync(DiffError);
const decodeSnapshot = Schema.decodeUnknownSync(ReviewSnapshot);
const decodePending = Schema.decodeUnknownSync(Pending);
const decodeWriteResult = Schema.decodeUnknownSync(FindingWriteResult);

afterAll(async () => {
  await Promise.all(disposers.map((dispose) => dispose()));
  cleanupScratchDirs();
});

/** Read the next SSE chunk as text, failing loudly rather than hanging forever. */
async function readSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder
): Promise<string> {
  // Generous: under full-suite load every handler runs recursive fs watches, and
  // macOS FSEvents can delay a frame well past a second. This only guards
  // against a truly hung stream, so a high ceiling costs nothing when frames flow.
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(
      () => reject(new Error("timed out waiting for an SSE frame")),
      10_000
    );
  });
  const { value, done } = await Promise.race([reader.read(), timeout]);
  return done || value === undefined ? "" : decoder.decode(value);
}

/** Write a product-walkthrough capture blob under a feature branch's Review. */
function writeCapture(
  repo: string,
  walkthroughId: string,
  file: string,
  bytes: string
) {
  const dir = path.join(
    repo,
    ".docent",
    "reviews",
    "feature",
    "walkthroughs",
    "product",
    walkthroughId,
    "captures"
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, file), bytes);
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

// The host is never read by the handler — only the path/query matters — so a
// fixed base keeps the request URLs readable.
const BASE = "http://docent.test";

/** A request-in/response-out client bound to a repo's `webHandler`. */
interface Client {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Build the serve handler for a repo and drive it directly, no port bound —
 * exactly the `request → Promise<Response>` the entry points hand `Bun.serve`.
 * The handler holds the `.docent/` watch open until disposed in afterAll.
 */
function serve(repo: string): Client {
  const { handler, dispose } = webHandler({ cwd: repo });
  disposers.push(() => dispose());
  return {
    fetch: (requestPath, init) =>
      handler(new Request(new URL(requestPath, BASE), init)),
  };
}

function postFinding(client: Client, body: unknown): Promise<Response> {
  return client.fetch("/api/findings", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

/** Fetch and decode the live Review snapshot. */
async function fetchReview(client: Client) {
  const res = await client.fetch("/api/review");
  return decodeSnapshot(await res.json());
}

const lineAnchor = {
  blobSha: "9c2a1f0",
  file: "feature.txt",
  kind: "line",
  lines: [1, 1],
  side: "head",
};

describe("serve routes", () => {
  test("GET /api/diff returns the live branch diff as JSON", async () => {
    const client = serve(featureRepo());

    const res = await client.fetch("/api/diff");

    expect(res.status).toBe(200);
    const body = decodeChange(await res.json());
    expect(body.branch).toBe("feature");
    expect(body.defaultBranch).toBe("main");
    expect(body.patch).toContain("+new file");
  });

  test("the diff renders live from git on every load", async () => {
    const repo = featureRepo();
    const client = serve(repo);
    await client.fetch("/api/diff");
    writeFileSync(path.join(repo, "second.txt"), "second\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "second commit");

    const res = await client.fetch("/api/diff");
    const body = decodeChange(await res.json());

    expect(body.patch).toContain("second.txt");
  });

  test("500s /api/diff with the error when the cwd is not a git repo", async () => {
    const dir = scratchDir("docent-serve-test-");
    const client = serve(dir);

    const res = await client.fetch("/api/diff");

    expect(res.status).toBe(500);
    const body = decodeDiffError(await res.json());
    expect(body.error).toMatch(/not a git repository/i);
  });

  test("GET /api/blob/:sha returns the raw blob bytes with cache-forever headers", async () => {
    const repo = featureRepo();
    const client = serve(repo);
    const sha = git(repo, "rev-parse", "HEAD:feature.txt");

    const res = await client.fetch(`/api/blob/${sha}`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("new file\n");
    // Content-addressed → immutable → cache forever.
    expect(res.headers.get("cache-control")).toMatch(/immutable/);
    expect(res.headers.get("cache-control")).toMatch(/max-age=31536000/);
  });

  test("GET /api/blob/:sha 404s an object id that is not in the repo", async () => {
    const client = serve(featureRepo());

    const res = await client.fetch(
      "/api/blob/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    );

    expect(res.status).toBe(404);
  });

  test("GET /api/blob/:sha 400s a malformed object id", async () => {
    const client = serve(featureRepo());

    const res = await client.fetch("/api/blob/not-a-sha");

    expect(res.status).toBe(400);
  });

  test("GET /api/blob/:sha/size returns the blob byte size as JSON, cached forever", async () => {
    const repo = featureRepo();
    const client = serve(repo);
    const sha = git(repo, "rev-parse", "HEAD:feature.txt");

    const res = await client.fetch(`/api/blob/${sha}/size`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ size: "new file\n".length });
    expect(res.headers.get("cache-control")).toMatch(/immutable/);
  });

  test("GET /api/blob/:sha/size 400s a malformed object id", async () => {
    const client = serve(featureRepo());

    const res = await client.fetch("/api/blob/not-a-sha/size");

    expect(res.status).toBe(400);
  });

  test("GET /api/capture serves a capture blob as application/json, cached forever", async () => {
    const repo = featureRepo();
    const client = serve(repo);
    writeCapture(repo, "wlk_01PROD", "shaA.rrweb.json", '[{"type":4}]');

    const res = await client.fetch("/api/capture/wlk_01PROD/shaA.rrweb.json");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual([{ type: 4 }]);
    // Content-addressed → immutable → cache forever.
    expect(res.headers.get("cache-control")).toMatch(/immutable/);
  });

  test("GET /api/capture serves a hand-authored walkthrough id", async () => {
    const repo = featureRepo();
    const client = serve(repo);
    writeCapture(repo, "wlk_my_tour", "shaA.rrweb.json", '[{"type":4}]');

    const res = await client.fetch("/api/capture/wlk_my_tour/shaA.rrweb.json");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ type: 4 }]);
  });

  test("GET /api/capture 404s an absent capture file", async () => {
    const client = serve(featureRepo());

    const res = await client.fetch(
      "/api/capture/wlk_01PROD/missing.rrweb.json"
    );

    expect(res.status).toBe(404);
  });

  test("GET /api/capture 400s a walkthrough id or filename that could traverse", async () => {
    const client = serve(featureRepo());

    const badWlk = await client.fetch("/api/capture/not-a-wlk/shaA.rrweb.json");
    // A separator-carrying tail satisfies the id brand, but is not one segment.
    const escapingWlk = await client.fetch(
      "/api/capture/wlk_%2e%2e%2fsecret/shaA.rrweb.json"
    );
    const badFile = await client.fetch(
      "/api/capture/wlk_01PROD/%2e%2e%2fsecret"
    );

    expect(badWlk.status).toBe(400);
    expect(escapingWlk.status).toBe(400);
    expect(badFile.status).toBe(400);
  });

  test("GET /api/pending returns the dirty working-tree preview as JSON", async () => {
    const repo = featureRepo();
    const client = serve(repo);
    writeFileSync(path.join(repo, "feature.txt"), "new file\nplus an edit\n");
    writeFileSync(path.join(repo, "fresh.txt"), "untracked\n");

    const res = await client.fetch("/api/pending");

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
    const client = serve(repo);

    const res = await client.fetch("/api/pending");

    const body = decodePending(await res.json());
    expect(body.dirty).toBe(false);
    expect(body.patch).toBe("");
  });

  test("GET /api/pending?range=cumulative previews base..worktree", async () => {
    const repo = featureRepo();
    const client = serve(repo);
    writeFileSync(path.join(repo, "working.txt"), "uncommitted\n");

    const res = await client.fetch("/api/pending?range=cumulative");

    const body = decodePending(await res.json());
    expect(body.range).toBe("cumulative");
    // The committed feature file plus the uncommitted working file.
    expect(body.patch).toContain("feature.txt");
    expect(body.patch).toContain("working.txt");
  });

  test("GET /api/worktree reads live working-tree bytes, explicitly uncached", async () => {
    const repo = featureRepo();
    const client = serve(repo);
    writeFileSync(path.join(repo, "feature.txt"), "edited live on disk\n");

    const res = await client.fetch("/api/worktree?path=feature.txt");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("edited live on disk\n");
    // The working tree is mutable — never cache it.
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  test("GET /api/worktree 400s a path that escapes the repo root", async () => {
    const client = serve(featureRepo());

    const res = await client.fetch("/api/worktree?path=../../../etc/passwd");

    expect(res.status).toBe(400);
  });

  test("GET /api/worktree 404s a path that does not exist", async () => {
    const client = serve(featureRepo());

    const res = await client.fetch("/api/worktree?path=nope.txt");

    expect(res.status).toBe(404);
  });

  test("GET /api/health returns the repo root for liveness detection", async () => {
    const repo = featureRepo();
    const client = serve(repo);

    const res = await client.fetch("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      root: git(repo, "rev-parse", "--show-toplevel"),
    });
  });

  test("GET /api/review auto-creates and returns the branch's snapshot", async () => {
    const repo = featureRepo();
    const client = serve(repo);

    const res = await client.fetch("/api/review");

    expect(res.status).toBe(200);
    const snap = decodeSnapshot(await res.json());
    expect(snap.review.schema).toBe("docent/review");
    expect(snap.review.branch).toBe("feature");
    expect(snap.review.base).toBe("main");
    expect(
      existsSync(
        path.join(repo, ".docent", "reviews", "feature", "review.json")
      )
    ).toBe(true);
  });

  test("POST /api/viewed appends an event the review snapshot then reports", async () => {
    const repo = featureRepo();
    const client = serve(repo);

    const post = await client.fetch("/api/viewed", {
      body: JSON.stringify({ blobSha: "9c2a1f0", path: "feature.txt" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(post.status).toBe(200);
    const event = await post.json();
    expect(event).toMatchObject({ blobSha: "9c2a1f0", path: "feature.txt" });
    const review = await client.fetch("/api/review");
    const snap = decodeSnapshot(await review.json());
    expect(snap.viewed).toEqual([
      { blobSha: "9c2a1f0", path: "feature.txt", ts: event.ts },
    ]);
  });

  test("POST /api/viewed 400s a malformed body", async () => {
    const client = serve(featureRepo());

    const res = await client.fetch("/api/viewed", {
      body: JSON.stringify({ nope: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(400);
  });

  test("POST /api/viewed 400s a body that isn't valid JSON", async () => {
    const client = serve(featureRepo());

    const res = await client.fetch("/api/viewed", {
      body: "not json",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(400);
  });

  test("POST /api/findings opens a Finding, minting the head's Change", async () => {
    const client = serve(featureRepo());

    const res = await postFinding(client, {
      anchor: lineAnchor,
      body: "the flush races the mark",
      op: "open",
    });

    expect(res.status).toBe(200);
    const result = decodeWriteResult(await res.json());
    expect(result.findingId).toMatch(/^fnd_/);
    expect(result.record).toBe("001-open.md");
    expect(result.changeId as string).toBe("chg_001");

    // The record and its minted Change are both visible in the live snapshot.
    const snap = await fetchReview(client);
    expect(snap.changes.map((change) => change.id as string)).toEqual([
      "chg_001",
    ]);
    const finding = snap.findings.find(
      (entry) => entry.id === result.findingId
    );
    const folded = foldFinding(result.findingId, finding?.records ?? []);
    expect(folded.body).toBe("the flush races the mark");
    expect(folded.anchor).toMatchObject({ file: "feature.txt", kind: "line" });
    // Attribution is the human resolved from git config, never gating.
    expect(finding?.records.at(0)?.author).toMatchObject({ kind: "human" });
  });

  test("POST /api/findings appends a reply to an existing Finding", async () => {
    const client = serve(featureRepo());
    const openRes = await postFinding(client, {
      anchor: lineAnchor,
      body: "flagged",
      op: "open",
    });
    const opened = decodeWriteResult(await openRes.json());

    const res = await postFinding(client, {
      body: "fixed",
      findingId: opened.findingId,
      op: "reply",
    });

    expect(res.status).toBe(200);
    expect(decodeWriteResult(await res.json()).record).toBe("002-reply.md");
    const snap = await fetchReview(client);
    const finding = snap.findings.find(
      (entry) => entry.id === opened.findingId
    );
    expect(foldFinding(opened.findingId, finding?.records ?? []).status).toBe(
      "open"
    );
  });

  test("POST /api/findings appends an action that hands the Finding back", async () => {
    const client = serve(featureRepo());
    const openRes = await postFinding(client, {
      anchor: lineAnchor,
      body: "flagged",
      op: "open",
    });
    const opened = decodeWriteResult(await openRes.json());

    const res = await postFinding(client, {
      findingId: opened.findingId,
      op: "action",
    });

    expect(res.status).toBe(200);
    expect(decodeWriteResult(await res.json()).record).toBe("002-action.md");
    const snap = await fetchReview(client);
    const finding = snap.findings.find(
      (entry) => entry.id === opened.findingId
    );
    expect(foldFinding(opened.findingId, finding?.records ?? []).status).toBe(
      "actioned"
    );
  });

  test("POST /api/findings 400s a malformed body", async () => {
    const client = serve(featureRepo());

    const res = await postFinding(client, { op: "nonsense" });

    expect(res.status).toBe(400);
  });

  test("GET /api/events pushes a change when .docent/ is written externally", async () => {
    const repo = featureRepo();
    const client = serve(repo);
    const controller = new AbortController();
    const res = await client.fetch("/api/events", {
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

      expect(await readSse(reader, decoder)).toContain("review-changed");
    } finally {
      // Cancel the request so the handler's graceful shutdown doesn't wait on it.
      controller.abort();
    }
  });

  test("GET /api/events pushes a change when a working-tree file is edited", async () => {
    const repo = featureRepo();
    const client = serve(repo);
    const controller = new AbortController();
    const res = await client.fetch("/api/events", {
      signal: controller.signal,
    });
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

      expect(await readSse(reader, decoder)).toContain("review-changed");
    } finally {
      controller.abort();
    }
  });
});
