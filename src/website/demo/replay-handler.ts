import { ANCHOR_KIND } from "@shared/enums/anchor-kind";
import { Change } from "@shared/schemas/change";
import { Author, CommentRecord } from "@shared/schemas/comment";
import type { Anchor } from "@shared/schemas/comment";
import { CommentWrite } from "@shared/schemas/comment-write";
import type { CommentWriteResult } from "@shared/schemas/comment-write";
import { CommentId } from "@shared/schemas/ids";
import type { ChangeId } from "@shared/schemas/ids";
import { Pending } from "@shared/schemas/pending";
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
import { max } from "radashi";

import { DemoSnapshot, keyPathname, requestKey } from "./snapshot";
import type { RecordedResponse } from "./snapshot";

const decodeSnapshot = Schema.decodeUnknownSync(DemoSnapshot);
const decodeReview = Schema.decodeUnknownSync(ReviewSnapshot);
const decodeCommentWrite = Schema.decodeUnknownSync(CommentWrite);
const decodeViewedRequest = Schema.decodeUnknownSync(ViewedRequest);

const Health = Schema.Struct({ root: Schema.String });

const REVIEW_KEY = "GET /api/review";
const EVENTS_KEY = "GET /api/events";
const COMMENTS_KEY = "POST /api/comments";
const VIEWED_KEY = "POST /api/viewed";

/** Recorded bodies the shared schemas can vet; `blob` and `capture` carry opaque bytes. */
const RECORDED_BODY_SCHEMAS: Record<string, (input: unknown) => unknown> = {
  "/api/diff": Schema.decodeUnknownSync(Change),
  "/api/health": Schema.decodeUnknownSync(Health),
  "/api/pending": Schema.decodeUnknownSync(Pending),
  "/api/review": decodeReview,
};

const DEMO_AUTHOR = Author.make({ display: "You", id: "demo", kind: "human" });

interface CommentState {
  anchorFile?: string;
  id: CommentId;
  records: CommentRecord[];
}

interface ReviewState {
  changes: readonly ChangeRecord[];
  comments: CommentState[];
  review: Review;
  viewed: ViewedEvent[];
  walkthroughs: readonly WalkthroughEntry[];
}

interface ReplayContext {
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

function badRequest(cause: unknown): Response {
  return errorResponse(
    cause instanceof Error ? cause.message : String(cause),
    400
  );
}

/**
 * A read the capture harness never recorded is a coverage bug, so it answers 501
 * rather than a 404 the client would render as a legitimately empty state.
 */
function unrecorded(key: string): Response {
  console.error(`docent demo: no recorded response for ${key}`);
  return errorResponse(`no recorded response for ${key}`, 501);
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function validateRecordedBodies(
  responses: ReadonlyMap<string, RecordedResponse>
) {
  for (const [key, recorded] of responses) {
    const decode = RECORDED_BODY_SCHEMAS[keyPathname(key)];

    if (decode === undefined || !isSuccess(recorded.status)) {
      continue;
    }

    try {
      decode(JSON.parse(recorded.body));
    } catch (error) {
      throw new Error(
        `demo snapshot no longer matches the API contract at "${key}"`,
        { cause: error }
      );
    }
  }
}

function seedReviewState(
  responses: ReadonlyMap<string, RecordedResponse>
): ReviewState {
  const recorded = responses.get(REVIEW_KEY);
  if (recorded === undefined) {
    throw new Error(
      `demo snapshot is missing "${REVIEW_KEY}", which seeds the in-memory Review`
    );
  }

  const seed = decodeReview(JSON.parse(recorded.body));
  if (seed.changes.length === 0) {
    throw new Error(
      "demo snapshot's Review holds no Change, so a write has no head Change to record against"
    );
  }

  return {
    changes: [...seed.changes],
    comments: seed.comments.map((entry) => ({
      id: entry.id,
      records: [...entry.records],
      ...(entry.anchorFile === undefined
        ? {}
        : { anchorFile: entry.anchorFile }),
    })),
    review: seed.review,
    viewed: [...seed.viewed],
    walkthroughs: [...seed.walkthroughs],
  };
}

function reviewBody(state: ReviewState) {
  return {
    changes: state.changes,
    comments: state.comments,
    review: state.review,
    viewed: state.viewed,
    walkthroughs: state.walkthroughs,
  };
}

/** The demo's head never moves, so every write records against the newest captured Change. */
function headChangeId(state: ReviewState): ChangeId {
  const head = state.changes.at(-1);
  if (head === undefined) {
    throw new Error("demo Review lost its Changes");
  }
  return head.id;
}

const RECORD_SEQUENCE = /^(?<sequence>\d+)-/;

/** Zero-padded because `foldComment` reads Status off the lexically last record name. */
function nextRecordName(
  records: readonly CommentRecord[],
  op: CommentWrite["op"]
): string {
  const sequences = records.flatMap((record) => {
    const value = RECORD_SEQUENCE.exec(record.name)?.groups?.sequence;
    return value === undefined ? [] : [Number(value)];
  });
  const next = String((max(sequences) ?? 0) + 1).padStart(3, "0");

  return `${next}-${op}.md`;
}

function demoCommentId(sequence: number): string {
  return `cmt_demo${String(sequence).padStart(3, "0")}`;
}

function mintCommentId(state: ReviewState): CommentId {
  const taken = new Set<string>(state.comments.map((comment) => comment.id));

  let sequence = state.comments.length + 1;
  while (taken.has(demoCommentId(sequence))) {
    sequence += 1;
  }

  return CommentId.make(demoCommentId(sequence));
}

/** Mirrors the server's read path: only the code arms of an Anchor carry a file. */
function anchorFile(anchor: Anchor): string | undefined {
  if (anchor.kind === ANCHOR_KIND.line || anchor.kind === ANCHOR_KIND.file) {
    return anchor.file;
  }
  return undefined;
}

function openComment(state: ReviewState, anchor: Anchor): CommentState {
  const file = anchorFile(anchor);
  const comment: CommentState = {
    id: mintCommentId(state),
    records: [],
    ...(file === undefined ? {} : { anchorFile: file }),
  };

  state.comments.push(comment);

  return comment;
}

function findComment(
  state: ReviewState,
  id: CommentId
): CommentState | undefined {
  return state.comments.find((comment) => comment.id === id);
}

/** Status is not written: the record's type and its place in the log are the whole of it. */
function appendCommentRecord(
  context: ReplayContext,
  write: CommentWrite
): CommentWriteResult | undefined {
  const { state } = context;
  const comment =
    write.op === "open"
      ? openComment(state, write.anchor)
      : findComment(state, write.commentId);

  if (comment === undefined) {
    return undefined;
  }

  const changeId = headChangeId(state);
  const record = nextRecordName(comment.records, write.op);

  comment.records.push(
    CommentRecord.make({
      author: DEMO_AUTHOR,
      body: "body" in write ? write.body : "",
      changeId,
      createdAt: new Date().toISOString(),
      name: record,
      schema: "docent/comment",
      type: write.op,
      ...(write.op === "open" ? { anchor: write.anchor } : {}),
    })
  );

  return { changeId, commentId: comment.id, record };
}

async function commentWrite(
  context: ReplayContext,
  request: Request
): Promise<Response> {
  let write: CommentWrite;
  try {
    write = decodeCommentWrite(await request.json());
  } catch (error) {
    return badRequest(error);
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
    return badRequest(error);
  }

  const event = ViewedEvent.make({
    blobSha: toggle.blobSha,
    path: toggle.path,
    ts: new Date().toISOString(),
  });
  state.viewed.push(event);

  return json(event);
}

const SSE_HEADERS = {
  "cache-control": "no-cache",
  "content-type": "text/event-stream",
};

/** The demo watches nothing, so the stream opens and stays silent for the client's lifetime. */
function eventStream(): Response {
  return new Response(new ReadableStream(), { headers: SSE_HEADERS });
}

function replayRecorded(
  responses: ReadonlyMap<string, RecordedResponse>,
  key: string
): Response {
  const recorded = responses.get(key);
  if (recorded === undefined) {
    return unrecorded(key);
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
    return eventStream();
  }
  if (key === REVIEW_KEY) {
    return json(reviewBody(context.state));
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
 * Recorded bodies are decoded against the shared schemas once, here at
 * construction, so a snapshot that has drifted from the API contract fails at
 * demo boot rather than on whichever request a visitor happens to make first.
 *
 * @throws {Error} when the snapshot is malformed, lacks the `GET /api/review`
 * recording that seeds the Review, or carries a body the current schemas reject.
 */
export function replayHandler(
  snapshot: unknown,
  options: ReplayOptions = {}
): (request: Request) => Promise<Response> {
  const responses = new Map(Object.entries(decodeSnapshot(snapshot).responses));

  validateRecordedBodies(responses);

  const context: ReplayContext = {
    responses,
    state: seedReviewState(responses),
  };
  const basepath = options.basepath ?? "";

  return async (request) =>
    await handle(
      context,
      requestKey({ basepath, method: request.method, url: request.url }),
      request
    );
}
