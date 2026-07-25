import { describe, expect, test } from "bun:test";

import { foldComment } from "@shared/lib/comment";
import { planDrift } from "@shared/lib/drift";
import { Change } from "@shared/schemas/change";
import type { CommentRecord } from "@shared/schemas/comment";
import { CommentWriteResult } from "@shared/schemas/comment-write";
import { CommentId } from "@shared/schemas/ids";
import { Pending } from "@shared/schemas/pending";
import { ReviewSnapshot, ViewedEvent } from "@shared/schemas/review";
import { Schema } from "effect";

import type { ReplayOptions } from "./replay-handler";
import { replayHandler } from "./replay-handler";

const decodeChange = Schema.decodeUnknownSync(Change);
const decodeSnapshot = Schema.decodeUnknownSync(ReviewSnapshot);
const decodePending = Schema.decodeUnknownSync(Pending);
const decodeWriteResult = Schema.decodeUnknownSync(CommentWriteResult);
const decodeViewedEvent = Schema.decodeUnknownSync(ViewedEvent);

const BASE = "http://docent.website";
const BORN_BLOB_SHA = "a1a1a1a1a1";
const HEAD_BLOB_SHA = "b2b2b2b2b2";
const HEAD_CHANGE_ID = "chg_002";
const SEEDED_COMMENT_ID = CommentId.make("cmt_seed001");

const LINE_ANCHOR = {
  blobSha: BORN_BLOB_SHA,
  file: "src/feature.ts",
  kind: "line",
  lines: [12, 14],
  side: "head",
};

const FIXTURE_AUTHOR = {
  display: "Fixture Reviewer",
  id: "reviewer@docent.test",
  kind: "human",
};

function changeRecord(id: string, headSha: string) {
  return {
    baseRef: "main",
    baseSha: "0000000",
    capturedAt: "2026-01-01T00:00:00.000Z",
    headRef: "feature",
    headSha,
    id,
    schema: "docent/change",
  };
}

function seededReview() {
  return {
    changes: [
      changeRecord("chg_001", "1111111"),
      changeRecord("chg_002", "2222222"),
    ],
    comments: [
      {
        anchorFile: "src/feature.ts",
        id: SEEDED_COMMENT_ID,
        records: [
          {
            anchor: LINE_ANCHOR,
            author: FIXTURE_AUTHOR,
            body: "this branch never runs",
            changeId: "chg_001",
            createdAt: "2026-01-01T00:01:00.000Z",
            name: "001-open.md",
            schema: "docent/comment",
            type: "open",
          },
        ],
      },
    ],
    review: {
      base: "main",
      branch: "feature",
      id: "rev_demo",
      schema: "docent/review",
      title: "Add the feature",
    },
    viewed: [],
    walkthroughs: [
      {
        id: "wlk_demo001",
        kind: "code",
        manifest: {
          bornChangeId: "chg_001",
          id: "wlk_demo001",
          kind: "code",
          schema: "docent/walkthrough",
          sections: ["001-intro.md"],
          title: "How the feature lands",
        },
        sections: [
          {
            body: "The entry point moves into its own module.",
            id: "sec_001",
            ranges: [
              {
                blobSha: HEAD_BLOB_SHA,
                file: "src/feature.ts",
                lines: [1, 8],
                side: "head",
              },
            ],
            schema: "docent/walkthrough-section",
            title: "The new module",
          },
        ],
      },
    ],
  };
}

function recordedJson(value: unknown) {
  return {
    body: JSON.stringify(value),
    headers: { "content-type": "application/json" },
    status: 200,
  };
}

function pendingPreview(range: string) {
  return {
    baseSha: "0000000",
    branch: "feature",
    dirty: true,
    headSha: "2222222",
    patch: `--- a/src/feature.ts\n+++ b/src/feature.ts\n@@ -1 +1 @@\n+${range}\n`,
    range,
    root: "/demo/repo",
  };
}

function demoSnapshot() {
  return {
    responses: {
      "GET /api/blob/b2b2b2b2b2": {
        body: "export function feature() {}\n",
        headers: {
          "cache-control": "public, max-age=31536000, immutable",
          "content-type": "application/octet-stream",
        },
        status: 200,
      },
      "GET /api/capture/wlk_demo001/shaA.rrweb.json": {
        body: '[{"type":4}]',
        headers: {
          "cache-control": "public, max-age=31536000, immutable",
          "content-type": "application/json",
        },
        status: 200,
      },
      "GET /api/diff": recordedJson({
        baseSha: "0000000",
        branch: "feature",
        defaultBranch: "main",
        generated: [],
        headSha: "2222222",
        patch:
          "--- a/src/feature.ts\n+++ b/src/feature.ts\n@@ -1 +1 @@\n+export function feature() {}\n",
        remoteUrl: "https://github.com/angusfretwell/docent",
        root: "/demo/repo",
      }),
      "GET /api/health": recordedJson({ root: "/demo/repo" }),
      "GET /api/pending?range=cumulative": recordedJson(
        pendingPreview("cumulative")
      ),
      "GET /api/pending?range=incremental": recordedJson(
        pendingPreview("incremental")
      ),
      "GET /api/review": recordedJson(seededReview()),
    },
  };
}

interface Client {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

function serve(options?: ReplayOptions): Client {
  const replay = replayHandler(demoSnapshot(), options);
  return {
    fetch: (requestPath, init) =>
      replay(new Request(new URL(requestPath, BASE), init)),
  };
}

async function fetchReview(client: Client): Promise<ReviewSnapshot> {
  const res = await client.fetch("/api/review");
  return decodeSnapshot(await res.json());
}

function recordsFor(
  snapshot: ReviewSnapshot,
  id: CommentId
): readonly CommentRecord[] {
  return snapshot.comments.find((entry) => entry.id === id)?.records ?? [];
}

function statusOf(snapshot: ReviewSnapshot, id: CommentId): string {
  return foldComment(id, recordsFor(snapshot, id)).status;
}

/** The Anchor's standing against the current head blob — the whole of a Comment's Drift. */
function driftOf(snapshot: ReviewSnapshot, id: CommentId) {
  const { anchor } = foldComment(id, recordsFor(snapshot, id));
  if (anchor === undefined) {
    throw new Error(`Comment ${id} lost its Anchor`);
  }
  return planDrift(anchor, { currentSideSha: HEAD_BLOB_SHA });
}

function postJson(
  client: Client,
  path: string,
  body: unknown
): Promise<Response> {
  return client.fetch(path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function writeComment(client: Client, write: unknown) {
  const res = await postJson(client, "/api/comments", write);
  return decodeWriteResult(await res.json());
}

async function openComment(client: Client, body: string) {
  return await writeComment(client, { anchor: LINE_ANCHOR, body, op: "open" });
}

async function silenceOf(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<"frame" | "silent"> {
  const silence = new Promise<"silent">((resolve) => {
    setTimeout(() => resolve("silent"), 50);
  });
  return await Promise.race([
    reader.read().then(() => "frame" as const),
    silence,
  ]);
}

describe("replay reads", () => {
  test("GET /api/diff replays the recorded Change", async () => {
    const client = serve();

    const res = await client.fetch("/api/diff");

    expect(res.status).toBe(200);
    const change = decodeChange(await res.json());
    expect(change.branch).toBe("feature");
    expect(change.patch).toContain("export function feature");
  });

  test("GET /api/pending replays the recording for each range", async () => {
    const client = serve();

    const incremental = await client.fetch("/api/pending?range=incremental");
    const cumulative = await client.fetch("/api/pending?range=cumulative");

    expect(decodePending(await incremental.json()).range).toBe("incremental");
    expect(decodePending(await cumulative.json()).range).toBe("cumulative");
  });

  test("GET /api/review replays the seeded Review", async () => {
    const client = serve();

    const snapshot = await fetchReview(client);

    expect(snapshot.review.branch).toBe("feature");
    expect(snapshot.changes.map((change) => change.id as string)).toEqual([
      "chg_001",
      "chg_002",
    ]);
    expect(snapshot.comments.map((entry) => entry.id as string)).toEqual([
      SEEDED_COMMENT_ID,
    ]);
    expect(snapshot.walkthroughs.at(0)?.sections.at(0)?.title).toBe(
      "The new module"
    );
  });

  test("GET /api/blob/:sha replays the bytes and the cache headers", async () => {
    const client = serve();

    const res = await client.fetch(`/api/blob/${HEAD_BLOB_SHA}`);

    expect(await res.text()).toBe("export function feature() {}\n");
    expect(res.headers.get("cache-control")).toMatch(/immutable/);
  });

  test("GET /api/capture replays the capture stream as JSON", async () => {
    const client = serve();

    const res = await client.fetch("/api/capture/wlk_demo001/shaA.rrweb.json");

    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual([{ type: 4 }]);
  });

  test("GET /api/health replays the recorded root", async () => {
    const client = serve();

    const res = await client.fetch("/api/health");

    expect(await res.json()).toEqual({ root: "/demo/repo" });
  });

  test("a request under a basepath replays the recording keyed without it", async () => {
    const client = serve({ basepath: "/demo" });

    const res = await client.fetch("/demo/api/diff");

    expect(decodeChange(await res.json()).branch).toBe("feature");
  });

  test("an unrecorded read fails loudly rather than reading as empty", async () => {
    const client = serve();

    const res = await client.fetch("/api/blob/deadbeef");

    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({
      error: "no recorded response for GET /api/blob/deadbeef",
    });
  });
});

describe("replay comment writes", () => {
  test("an open write reads back as an open Comment on the head Change", async () => {
    const client = serve();

    const opened = await openComment(client, "the flush races the mark");

    expect(opened.commentId as string).toMatch(/^cmt_/);
    expect(opened.changeId as string).toBe(HEAD_CHANGE_ID);
    const snapshot = await fetchReview(client);
    const folded = foldComment(
      opened.commentId,
      recordsFor(snapshot, opened.commentId)
    );
    expect(folded.body).toBe("the flush races the mark");
    expect(folded.anchor).toMatchObject({
      file: "src/feature.ts",
      kind: "line",
    });
    expect(folded.status).toBe("open");
  });

  test("an open write records the file its Anchor points at", async () => {
    const client = serve();

    const opened = await openComment(client, "flagged");

    const snapshot = await fetchReview(client);
    const entry = snapshot.comments.find(
      (comment) => comment.id === opened.commentId
    );
    expect(entry?.anchorFile).toBe("src/feature.ts");
  });

  test("a reply reads back on the Comment and leaves it open", async () => {
    const client = serve();

    await writeComment(client, {
      body: "still there",
      commentId: SEEDED_COMMENT_ID,
      op: "reply",
    });

    const snapshot = await fetchReview(client);
    expect(
      foldComment(
        SEEDED_COMMENT_ID,
        recordsFor(snapshot, SEEDED_COMMENT_ID)
      ).replies.map((reply) => reply.body)
    ).toEqual(["still there"]);
    expect(statusOf(snapshot, SEEDED_COMMENT_ID)).toBe("open");
  });

  test("an action write hands the Comment back", async () => {
    const client = serve();

    await writeComment(client, { commentId: SEEDED_COMMENT_ID, op: "action" });

    expect(statusOf(await fetchReview(client), SEEDED_COMMENT_ID)).toBe(
      "actioned"
    );
  });

  test("a resolve write closes the Comment", async () => {
    const client = serve();

    await writeComment(client, { commentId: SEEDED_COMMENT_ID, op: "resolve" });

    expect(statusOf(await fetchReview(client), SEEDED_COMMENT_ID)).toBe(
      "resolved"
    );
  });

  test("a reopen write after a resolve opens the Comment again", async () => {
    const client = serve();
    await writeComment(client, { commentId: SEEDED_COMMENT_ID, op: "resolve" });

    await writeComment(client, { commentId: SEEDED_COMMENT_ID, op: "reopen" });

    expect(statusOf(await fetchReview(client), SEEDED_COMMENT_ID)).toBe("open");
  });

  test("a reply after a resolve moves the Status back to open", async () => {
    const client = serve();
    await writeComment(client, { commentId: SEEDED_COMMENT_ID, op: "resolve" });

    await writeComment(client, {
      body: "not quite",
      commentId: SEEDED_COMMENT_ID,
      op: "reply",
    });

    expect(statusOf(await fetchReview(client), SEEDED_COMMENT_ID)).toBe("open");
  });

  test("Status still follows the log past the ninth record", async () => {
    const client = serve();
    const opened = await openComment(client, "flagged");
    for (let index = 0; index < 9; index += 1) {
      await writeComment(client, {
        body: `note ${index}`,
        commentId: opened.commentId,
        op: "reply",
      });
    }

    const resolved = await writeComment(client, {
      commentId: opened.commentId,
      op: "resolve",
    });

    expect(resolved.record).toBe("011-resolve.md");
    expect(statusOf(await fetchReview(client), opened.commentId)).toBe(
      "resolved"
    );
  });

  test("Drift is unchanged after a write", async () => {
    const client = serve();
    const before = driftOf(await fetchReview(client), SEEDED_COMMENT_ID);

    await writeComment(client, { commentId: SEEDED_COMMENT_ID, op: "resolve" });

    expect(driftOf(await fetchReview(client), SEEDED_COMMENT_ID)).toEqual(
      before
    );
  });

  test("an unrecognised write op is rejected", async () => {
    const client = serve();

    const res = await postJson(client, "/api/comments", {
      commentId: SEEDED_COMMENT_ID,
      op: "nonsense",
    });

    expect(res.status).toBe(400);
  });

  test("a write body that isn't valid JSON is rejected", async () => {
    const client = serve();

    const res = await client.fetch("/api/comments", {
      body: "not json",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(400);
  });
});

describe("replay viewed writes", () => {
  test("a mark-viewed write reads back on the Review", async () => {
    const client = serve();

    const res = await postJson(client, "/api/viewed", {
      blobSha: HEAD_BLOB_SHA,
      path: "src/feature.ts",
    });

    const event = decodeViewedEvent(await res.json());
    const snapshot = await fetchReview(client);
    expect(snapshot.viewed).toEqual([
      { blobSha: HEAD_BLOB_SHA, path: "src/feature.ts", ts: event.ts },
    ]);
  });

  test("a second mark-viewed write appends, flipping the path's parity back", async () => {
    const client = serve();
    const mark = { blobSha: HEAD_BLOB_SHA, path: "src/feature.ts" };
    await postJson(client, "/api/viewed", mark);

    await postJson(client, "/api/viewed", mark);

    const snapshot = await fetchReview(client);
    expect(snapshot.viewed).toHaveLength(2);
  });

  test("a mark-viewed body that isn't a viewed request is rejected", async () => {
    const client = serve();

    const res = await postJson(client, "/api/viewed", { nope: true });

    expect(res.status).toBe(400);
  });
});

describe("replay snapshot validation", () => {
  test("a snapshot without the Review recording fails at construction", () => {
    const { responses } = demoSnapshot();
    const { "GET /api/review": _review, ...rest } = responses;

    expect(() => replayHandler({ responses: rest })).toThrow(
      /GET \/api\/review/
    );
  });
});

describe("replay lifecycle", () => {
  test("a fresh handler is pristine, independent of a prior one's writes", async () => {
    const written = serve();
    await writeComment(written, {
      commentId: SEEDED_COMMENT_ID,
      op: "resolve",
    });
    await postJson(written, "/api/viewed", {
      blobSha: HEAD_BLOB_SHA,
      path: "src/feature.ts",
    });

    const snapshot = await fetchReview(serve());

    expect(statusOf(snapshot, SEEDED_COMMENT_ID)).toBe("open");
    expect(snapshot.viewed).toEqual([]);
  });

  test("GET /api/events opens a stream that never emits", async () => {
    const client = serve();

    const res = await client.fetch("/api/events");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const { body } = res;
    if (!body) {
      throw new Error("the events response had no body");
    }
    const reader = body.getReader();
    try {
      expect(await silenceOf(reader)).toBe("silent");
    } finally {
      await reader.cancel();
    }
  });
});
