import { ANCHOR_KIND } from "@shared/enums/anchor-kind";
import { Author, CommentRecord } from "@shared/schemas/comment";
import type { Anchor } from "@shared/schemas/comment";
import { CommentWrite } from "@shared/schemas/comment-write";
import type { CommentWriteResult } from "@shared/schemas/comment-write";
import { CommentId } from "@shared/schemas/ids";
import type { ChangeId } from "@shared/schemas/ids";
import {
  ReviewSnapshot,
  ViewedEvent,
  ViewedRequest,
} from "@shared/schemas/review";
import type {
  ChangeRecord,
  Review,
  WalkthroughEntry,
} from "@shared/schemas/review";
import { Schema } from "effect";

import { DemoSnapshot, requestKey } from "./snapshot";
import type { RecordedResponse } from "./snapshot";

const decodeSnapshot = Schema.decodeUnknownSync(DemoSnapshot);
const decodeReview = Schema.decodeUnknownSync(ReviewSnapshot);
const decodeCommentWrite = Schema.decodeUnknownSync(CommentWrite);
const decodeViewedRequest = Schema.decodeUnknownSync(ViewedRequest);

const REVIEW_KEY = "GET /api/review";
const EVENTS_KEY = "GET /api/events";
const COMMENTS_KEY = "POST /api/comments";
const VIEWED_KEY = "POST /api/viewed";

const DEMO_AUTHOR = Author.make({ display: "You", id: "demo", kind: "human" });

interface CommentState {
  anchorFile?: string;
  id: CommentId;
  records: CommentRecord[];
}

/** The body `GET /api/review` answers with, mutable where a demo write lands. */
interface ReviewState {
  changes: readonly ChangeRecord[];
  comments: CommentState[];
  review: Review;
  viewed: ViewedEvent[];
  walkthroughs: readonly WalkthroughEntry[];
}

interface ReplayContext {
  /** The demo's head never moves, so every write records against the newest captured Change. */
  headChangeId: ChangeId;
  responses: ReadonlyMap<string, RecordedResponse>;
  state: ReviewState;
}

export interface ReplayOptions {
  /** Stripped from the request path before keying, for a demo served under a prefix. */
  basepath?: string;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

/** The client reads `error` off any non-2xx body, so every failure answers in that shape. */
function errorResponse(message: string, status: number): Response {
  return json({ error: message }, status);
}

function seedContext(
  responses: ReadonlyMap<string, RecordedResponse>
): ReplayContext {
  const recorded = responses.get(REVIEW_KEY);
  if (recorded === undefined) {
    throw new Error(
      `demo snapshot is missing "${REVIEW_KEY}", which seeds the in-memory Review`
    );
  }

  const seed = decodeReview(JSON.parse(recorded.body));
  const head = seed.changes.at(-1);
  if (head === undefined) {
    throw new Error(
      "demo snapshot's Review holds no Change, so a write has no head Change to record against"
    );
  }

  return {
    headChangeId: head.id,
    responses,
    state: {
      changes: seed.changes,
      comments: seed.comments.map((entry) => ({
        ...entry,
        records: [...entry.records],
      })),
      review: seed.review,
      viewed: [...seed.viewed],
      walkthroughs: seed.walkthroughs,
    },
  };
}

/** Zero-padded because `foldComment` reads Status off the lexically last record name. */
function nextRecordName(
  records: readonly CommentRecord[],
  op: CommentWrite["op"]
): string {
  return `${String(records.length + 1).padStart(3, "0")}-${op}.md`;
}

/** Mirrors the server's read path: only the code arms of an Anchor carry a file. */
function anchorFile(anchor: Anchor): string | undefined {
  if (anchor.kind === ANCHOR_KIND.line || anchor.kind === ANCHOR_KIND.file) {
    return anchor.file;
  }
  return undefined;
}

/** A sequenced id, which the record store never mints: it names a thread after its subject. */
function openComment(state: ReviewState, anchor: Anchor): CommentState {
  const sequence = String(state.comments.length + 1).padStart(3, "0");
  const comment: CommentState = {
    anchorFile: anchorFile(anchor),
    id: CommentId.make(`cmt_demo${sequence}`),
    records: [],
  };

  state.comments.push(comment);

  return comment;
}

/** Status is not written: the record's type and its place in the log are the whole of it. */
function appendCommentRecord(
  context: ReplayContext,
  write: CommentWrite
): CommentWriteResult | undefined {
  const { headChangeId, state } = context;
  const comment =
    write.op === "open"
      ? openComment(state, write.anchor)
      : state.comments.find((entry) => entry.id === write.commentId);

  if (comment === undefined) {
    return undefined;
  }

  const record = nextRecordName(comment.records, write.op);

  comment.records.push(
    CommentRecord.make({
      author: DEMO_AUTHOR,
      body: "body" in write ? write.body : "",
      changeId: headChangeId,
      createdAt: new Date().toISOString(),
      name: record,
      schema: "docent/comment",
      type: write.op,
      ...(write.op === "open" ? { anchor: write.anchor } : {}),
    })
  );

  return { changeId: headChangeId, commentId: comment.id, record };
}

async function commentWrite(
  context: ReplayContext,
  request: Request
): Promise<Response> {
  let write: CommentWrite;
  try {
    write = decodeCommentWrite(await request.json());
  } catch (error) {
    return errorResponse(String(error), 400);
  }

  const result = appendCommentRecord(context, write);
  if (result === undefined) {
    return errorResponse("no such Comment", 404);
  }

  return json(result);
}

/**
 * Append-only like the server: viewed state is the parity of a path's events for
 * the current head blob, so a second write un-views rather than removing the first.
 * @see src/client/features/diff/lib/viewed.ts
 */
async function viewedWrite(
  state: ReviewState,
  request: Request
): Promise<Response> {
  let toggle: ViewedRequest;
  try {
    toggle = decodeViewedRequest(await request.json());
  } catch (error) {
    return errorResponse(String(error), 400);
  }

  const event = ViewedEvent.make({
    blobSha: toggle.blobSha,
    path: toggle.path,
    ts: new Date().toISOString(),
  });
  state.viewed.push(event);

  return json(event);
}

/**
 * A read the capture harness never recorded is a coverage bug, so it answers 501
 * rather than a 404 the client would render as a legitimately empty state.
 */
function replayRecorded(
  responses: ReadonlyMap<string, RecordedResponse>,
  key: string
): Response {
  const recorded = responses.get(key);
  if (recorded === undefined) {
    return errorResponse(`no recorded response for ${key}`, 501);
  }

  return new Response(recorded.body, {
    headers: { ...recorded.headers },
    status: recorded.status,
  });
}

function handle(
  context: ReplayContext,
  key: string,
  request: Request
): Response | Promise<Response> {
  if (key === EVENTS_KEY) {
    // The demo watches nothing, so the stream opens and stays silent for the client's lifetime.
    return new Response(new ReadableStream(), {
      headers: {
        "cache-control": "no-cache",
        "content-type": "text/event-stream",
      },
    });
  }
  if (key === REVIEW_KEY) {
    return json(context.state);
  }
  if (key === COMMENTS_KEY) {
    return commentWrite(context, request);
  }
  if (key === VIEWED_KEY) {
    return viewedWrite(context.state, request);
  }

  return replayRecorded(context.responses, key);
}

/**
 * Drift stays frozen as captured: no demo write moves an Anchor, so nothing
 * recomputes it. State is per instance and lives only in memory, so constructing
 * a fresh handler — a page reload — is a pristine demo.
 *
 * @throws {Error} when the snapshot is malformed or lacks the `GET /api/review`
 * recording that seeds the Review.
 */
export function replayHandler(
  snapshot: unknown,
  options: ReplayOptions = {}
): (request: Request) => Promise<Response> {
  const context = seedContext(
    new Map(Object.entries(decodeSnapshot(snapshot).responses))
  );
  const basepath = options.basepath ?? "";

  return async (request) =>
    await handle(
      context,
      requestKey({ basepath, method: request.method, url: request.url }),
      request
    );
}
