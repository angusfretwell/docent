import { describe, expect, test } from "bun:test";

import type { FindingRecord } from "../schemas/finding";
import { findingLocation, foldFinding, sortFoldedFindings } from "./finding";

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
  fields: Partial<FindingRecord> & { name: string; type: FindingRecord["type"] }
) {
  return {
    author: claude,
    body: "",
    changeId: "chg_001",
    createdAt: "2026-07-10T02:14:00Z",
    schema: "docent/finding@3",
    ...fields,
  } as FindingRecord;
}

const lineAnchor = {
  blobSha: "9c2a1f0",
  file: "src/parser/stream.ts",
  kind: "line" as const,
  lines: [42, 47] as [number, number],
  side: "head" as const,
};

describe("foldFinding", () => {
  test("derives anchor and body from the open record", () => {
    const folded = foldFinding("fnd_1", [
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

  test("a fresh finding needs action", () => {
    const folded = foldFinding("fnd_1", [
      record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
    ]);

    expect(folded.resolved).toBe(false);
    expect(folded.whatsNext).toBe("needs-action");
  });

  test("collects replies and unique participants in order", () => {
    const folded = foldFinding("fnd_1", [
      record({
        anchor: lineAnchor,
        author: claude,
        name: "001-open.md",
        type: "open",
      }),
      record({
        author: angus,
        body: "fixed",
        disposition: "actioned",
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

  test.each([
    ["actioned", "needs-verify"],
    ["question", "needs-answer"],
    ["declined", "needs-decision"],
    [undefined, "needs-action"],
  ] as const)(
    "a reply with disposition %s folds to what's-next %s",
    (disposition, expected) => {
      const folded = foldFinding("fnd_1", [
        record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
        record({ disposition, name: "002-reply.md", type: "reply" }),
      ]);

      expect(folded.whatsNext).toBe(expected);
    }
  );

  test("re-commenting after a resolve reopens the finding at needs-action", () => {
    const folded = foldFinding("fnd_1", [
      record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
      record({ body: "done", name: "002-resolve.md", type: "resolve" }),
      record({
        body: "actually, one more thing",
        name: "003-reply.md",
        type: "reply",
      }),
    ]);

    expect(folded.resolved).toBe(false);
    expect(folded.whatsNext).toBe("needs-action");
  });

  test("a resolve record closes the finding", () => {
    const folded = foldFinding("fnd_1", [
      record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
      record({
        body: "verified under load",
        name: "002-resolve.md",
        type: "resolve",
      }),
    ]);

    expect(folded.resolved).toBe(true);
    expect(folded.whatsNext).toBe("closed");
  });

  test("a reopen after a resolve returns the finding to needs-action", () => {
    const folded = foldFinding("fnd_1", [
      record({ anchor: lineAnchor, name: "001-open.md", type: "open" }),
      record({ name: "002-resolve.md", type: "resolve" }),
      record({ name: "003-reopen.md", type: "reopen" }),
    ]);

    expect(folded.resolved).toBe(false);
    expect(folded.whatsNext).toBe("needs-action");
  });

  test("an edit record supersedes the named record's body", () => {
    const folded = foldFinding("fnd_1", [
      record({
        anchor: lineAnchor,
        body: "original open body",
        name: "001-open.md",
        type: "open",
      }),
      record({ body: "first reply", name: "002-reply.md", type: "reply" }),
      record({
        body: "corrected open body",
        edits: "001-open.md",
        name: "003-edit.md",
        type: "edit",
      }),
      record({
        body: "corrected reply",
        edits: "002-reply.md",
        name: "004-edit.md",
        type: "edit",
      }),
    ]);

    expect(folded.body).toBe("corrected open body");
    expect(folded.replies.map((reply) => reply.body)).toEqual([
      "corrected reply",
    ]);
  });

  test("folds an empty record list without throwing", () => {
    const folded = foldFinding("fnd_1", []);

    expect(folded.anchor).toBeUndefined();
    expect(folded.body).toBe("");
    expect(folded.whatsNext).toBe("needs-action");
  });
});

describe("findingLocation", () => {
  test("renders a line anchor as file:line", () => {
    expect(findingLocation(lineAnchor)).toBe("src/parser/stream.ts:42");
  });

  test("renders a file anchor as the path", () => {
    expect(
      findingLocation({
        blobSha: "abc",
        file: "src/main.ts",
        kind: "file",
        side: "head",
      })
    ).toBe("src/main.ts");
  });

  test("renders a whole-change anchor", () => {
    expect(findingLocation({ kind: "change" })).toBe("Whole change");
  });

  test("renders a missing anchor as detached", () => {
    const noAnchor = foldFinding("fnd_1", []).anchor;

    expect(findingLocation(noAnchor)).toBe("Detached");
  });
});

describe("sortFoldedFindings", () => {
  test("orders code findings by file then line", () => {
    const folded = sortFoldedFindings([
      foldFinding("b", [
        record({
          anchor: { ...lineAnchor, file: "src/b.ts", lines: [10, 10] },
          name: "001-open.md",
          type: "open",
        }),
      ]),
      foldFinding("a", [
        record({
          anchor: { ...lineAnchor, file: "src/a.ts", lines: [90, 90] },
          name: "001-open.md",
          type: "open",
        }),
      ]),
      foldFinding("a2", [
        record({
          anchor: { ...lineAnchor, file: "src/a.ts", lines: [5, 5] },
          name: "001-open.md",
          type: "open",
        }),
      ]),
    ]);

    expect(folded.map((finding) => finding.id)).toEqual(["a2", "a", "b"]);
  });
});
