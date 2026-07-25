import { describe, expect, test } from "bun:test";

import type { CommentRecord } from "../schemas/comment";
import { CommentId } from "../schemas/ids";
import { commentLocation, foldComment, sortFoldedComments } from "./comment";

const angus = {
  display: "Angus",
  id: "angusfretwell@me.com",
  kind: "human" as const,
};
const claude = {
  display: "Claude Code",
  id: "claude-code",
  kind: "agent" as const,
};

function record(
  fields: Partial<CommentRecord> & { name: string; type: CommentRecord["type"] }
) {
  return {
    author: claude,
    body: "",
    changeId: "chg_001",
    createdAt: "2026-07-10T02:14:00Z",
    schema: "docent/comment",
    ...fields,
  } as CommentRecord;
}

const lineAnchor = {
  blobSha: "9c2a1f0",
  file: "src/parser/stream.ts",
  kind: "line" as const,
  lines: [42, 47] as [number, number],
  side: "head" as const,
};

describe("foldComment", () => {
  test("derives anchor and body from the open record", () => {
    const folded = foldComment(CommentId.make("cmt_1"), [
      record({
        anchor: lineAnchor,
        body: "backpressure races the flush",
        name: "001-open.md",
        type: "open",
      }),
    ]);

    expect(folded.anchor).toEqual(lineAnchor);
    expect(folded.body).toBe("backpressure races the flush");
  });

  test("a fresh comment is open", () => {
    const folded = foldComment(CommentId.make("cmt_1"), [
      record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
    ]);

    expect(folded.status).toBe("open");
  });

  test("collects replies and unique participants in order", () => {
    const folded = foldComment(CommentId.make("cmt_1"), [
      record({
        anchor: lineAnchor,
        author: claude,
        name: "001-open.md",
        type: "open",
      }),
      record({
        author: angus,
        body: "fixed",
        name: "002-reply.md",
        type: "reply",
      }),
      record({
        author: angus,
        body: "and again",
        name: "003-reply.md",
        type: "reply",
      }),
    ]);

    expect(folded.replies.map((reply) => reply.body)).toEqual([
      "fixed",
      "and again",
    ]);
    expect(folded.participants.map((participant) => participant.id)).toEqual([
      "claude-code",
      "angusfretwell@me.com",
    ]);
  });

  test("an action record hands the comment back", () => {
    const folded = foldComment(CommentId.make("cmt_1"), [
      record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
      record({ body: "fixed the flush", name: "002-reply.md", type: "reply" }),
      record({ name: "003-action.md", type: "action" }),
    ]);

    expect(folded.status).toBe("actioned");
  });

  test("a reply after an action returns the comment to open", () => {
    const folded = foldComment(CommentId.make("cmt_1"), [
      record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
      record({ name: "002-action.md", type: "action" }),
      record({
        body: "not quite — it still races under load",
        name: "003-reply.md",
        type: "reply",
      }),
    ]);

    expect(folded.status).toBe("open");
  });

  test("re-commenting after a resolve reopens the comment", () => {
    const folded = foldComment(CommentId.make("cmt_1"), [
      record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
      record({ name: "002-resolve.md", type: "resolve" }),
      record({
        body: "actually, one more thing",
        name: "003-reply.md",
        type: "reply",
      }),
    ]);

    expect(folded.status).toBe("open");
  });

  test("a resolve record closes the comment", () => {
    const folded = foldComment(CommentId.make("cmt_1"), [
      record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
      record({ name: "002-resolve.md", type: "resolve" }),
    ]);

    expect(folded.status).toBe("resolved");
  });

  test("a reopen after a resolve returns the comment to open", () => {
    const folded = foldComment(CommentId.make("cmt_1"), [
      record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
      record({ name: "002-resolve.md", type: "resolve" }),
      record({ name: "003-reopen.md", type: "reopen" }),
    ]);

    expect(folded.status).toBe("open");
  });

  test("folds an empty record list without throwing", () => {
    const folded = foldComment(CommentId.make("cmt_1"), []);

    expect(folded.anchor).toBeUndefined();
    expect(folded.body).toBe("");
    expect(folded.status).toBe("open");
  });
});

describe("commentLocation", () => {
  test("renders a line anchor as file:line", () => {
    expect(commentLocation(lineAnchor)).toBe("src/parser/stream.ts:42");
  });

  test("renders a file anchor as the path", () => {
    expect(
      commentLocation({
        blobSha: "abc",
        file: "src/main.ts",
        kind: "file",
        side: "head",
      })
    ).toBe("src/main.ts");
  });

  test("renders a whole-change anchor", () => {
    expect(commentLocation({ kind: "change" })).toBe("Whole change");
  });

  test("renders a missing anchor as detached", () => {
    const noAnchor = foldComment(CommentId.make("cmt_1"), []).anchor;

    expect(commentLocation(noAnchor)).toBe("Detached");
  });
});

describe("sortFoldedComments", () => {
  test("orders code comments by file then line", () => {
    const folded = sortFoldedComments([
      foldComment(CommentId.make("cmt_b"), [
        record({
          anchor: { ...lineAnchor, file: "src/b.ts", lines: [10, 10] },
          name: "001-open.md",
          type: "open",
        }),
      ]),
      foldComment(CommentId.make("cmt_a"), [
        record({
          anchor: { ...lineAnchor, file: "src/a.ts", lines: [90, 90] },
          name: "001-open.md",
          type: "open",
        }),
      ]),
      foldComment(CommentId.make("cmt_a2"), [
        record({
          anchor: { ...lineAnchor, file: "src/a.ts", lines: [5, 5] },
          name: "001-open.md",
          type: "open",
        }),
      ]),
    ]);

    expect(folded.map((comment) => comment.id)).toEqual([
      CommentId.make("cmt_a2"),
      CommentId.make("cmt_a"),
      CommentId.make("cmt_b"),
    ]);
  });
});
