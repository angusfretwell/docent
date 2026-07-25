import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { cleanupScratchDirs, git, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Effect } from "effect";

import { listComments } from "./list";
import type { AnchorFlags } from "./write";
import {
  actionComment,
  addComment,
  buildAuthor,
  parseAnchorSpec,
  reopenComment,
  replyComment,
  resolveComment,
} from "./write";

const runtime = makeTestRuntime();

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function featureRepo(): string {
  const dir = scratchRepo("docent-cli-test-");
  git(dir, "checkout", "-b", "feature");
  writeFileSync(path.join(dir, "feature.ts"), "export const x = 1;\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "add feature");
  return dir;
}

function flags(overrides: Partial<AnchorFlags>): AnchorFlags {
  return { change: false, ...overrides };
}

function anchorSpec(overrides: Partial<AnchorFlags>) {
  return Effect.runSync(parseAnchorSpec(flags(overrides)));
}

function anchorSpecFails(overrides: Partial<AnchorFlags>): boolean {
  return (
    Effect.runSyncExit(parseAnchorSpec(flags(overrides)))._tag === "Failure"
  );
}

describe("parseAnchorSpec", () => {
  test("--change builds the whole-change arm", () => {
    expect(anchorSpec({ change: true })).toEqual({ kind: "change" });
  });

  test("--file alone builds a file arm; default side is head", () => {
    expect(anchorSpec({ file: "src/a.ts" })).toEqual({
      file: "src/a.ts",
      kind: "file",
      side: "head",
    });
  });

  test("--file --line builds a line arm; N:M and N-M and N all parse", () => {
    expect(anchorSpec({ file: "src/a.ts", line: "42:47" })).toMatchObject({
      kind: "line",
      lines: [42, 47],
    });
    expect(anchorSpec({ file: "src/a.ts", line: "3-9" })).toMatchObject({
      lines: [3, 9],
    });
    expect(anchorSpec({ file: "src/a.ts", line: "5" })).toMatchObject({
      lines: [5, 5],
    });
  });

  test("--anchor passes a raw arm through schema validation", () => {
    expect(anchorSpec({ anchor: '{"kind":"change"}' })).toEqual({
      anchor: { kind: "change" },
      kind: "raw",
    });
  });

  test("a bad --line, --side, --anchor, or no anchor is a usage error", () => {
    expect(anchorSpecFails({ file: "a.ts", line: "nope" })).toBe(true);
    expect(anchorSpecFails({ file: "a.ts", side: "sideways" })).toBe(true);
    expect(anchorSpecFails({ anchor: '{"kind":"bogus"}' })).toBe(true);
    expect(anchorSpecFails({})).toBe(true);
  });
});

describe("buildAuthor", () => {
  test("--agent attributes to an agent slug with optional model", async () => {
    const author = await runtime.runPromise(
      buildAuthor("/tmp", { agent: "claude-code", model: "claude-fable-5" })
    );

    expect(author).toEqual({
      display: "claude-code",
      id: "claude-code",
      kind: "agent",
      model: "claude-fable-5",
    });
  });

  test("defaults to the git-config human", async () => {
    const repo = featureRepo();

    const author = await runtime.runPromise(buildAuthor(repo, {}));

    expect(author).toMatchObject({ id: "test@example.com", kind: "human" });
  });
});

describe("write + fetch round-trip (shared write path)", () => {
  const run = runtime.runPromise;

  test("add mints an anchored comment, resolving the code arm's blobSha from git", async () => {
    const repo = featureRepo();

    const result = await run(
      addComment(repo, {
        anchor: {
          file: "feature.ts",
          kind: "line",
          lines: [1, 1],
          side: "head",
        },
        author: { agent: "claude-code" },
        body: "this const should be exported lazily",
      })
    );

    expect(result.commentId).toMatch(/^cmt_/);
    expect(result.record).toBe("001-open.md");
    expect(result.changeId as string).toBe("chg_001");

    const comments = await run(listComments(repo, { status: [] }));
    const comment = comments.at(0);
    expect(comment?.anchor?.kind).toBe("line");
    if (comment?.anchor?.kind === "line") {
      expect(comment.anchor.blobSha).toMatch(/^[0-9a-f]{40}/);
    }
    expect(comment?.participants.at(0)).toMatchObject({
      id: "claude-code",
      kind: "agent",
    });
  });

  test("action hands the comment back; resolve closes it", async () => {
    const repo = featureRepo();
    const { commentId } = await run(
      addComment(repo, {
        anchor: { kind: "change" },
        author: {},
        body: "whole-change note",
      })
    );

    await run(
      replyComment(repo, {
        author: { agent: "fixer" },
        body: "done",
        commentId,
      })
    );
    await run(actionComment(repo, { author: { agent: "fixer" }, commentId }));
    const afterAction = await run(listComments(repo, { status: [] }));
    expect(
      afterAction.find((comment) => comment.id === commentId)?.status
    ).toBe("actioned");

    await run(resolveComment(repo, { author: {}, commentId }));
    const afterResolve = await run(listComments(repo, { status: [] }));
    expect(
      afterResolve.find((comment) => comment.id === commentId)?.status
    ).toBe("resolved");
  });

  test("list filters on status, anchor-file, and author", async () => {
    const repo = featureRepo();
    await run(
      addComment(repo, {
        anchor: {
          file: "feature.ts",
          kind: "line",
          lines: [1, 1],
          side: "head",
        },
        author: { agent: "reviewer" },
        body: "on the file",
      })
    );
    const { commentId } = await run(
      addComment(repo, {
        anchor: { kind: "change" },
        author: { agent: "other" },
        body: "whole",
      })
    );
    await run(resolveComment(repo, { author: {}, commentId }));

    const open = await run(listComments(repo, { status: ["open"] }));
    const resolved = await run(listComments(repo, { status: ["resolved"] }));
    const onFile = await run(
      listComments(repo, { anchorFile: "feature.ts", status: [] })
    );
    const byReviewer = await run(
      listComments(repo, { author: "reviewer", status: [] })
    );

    expect(open).toHaveLength(1);
    expect(resolved).toHaveLength(1);
    expect(onFile).toHaveLength(1);
    expect(byReviewer).toHaveLength(1);
  });

  test("reopen returns a resolved comment to open", async () => {
    const repo = featureRepo();
    const { commentId } = await run(
      addComment(repo, {
        anchor: { kind: "change" },
        author: {},
        body: "flagged",
      })
    );
    await run(resolveComment(repo, { author: {}, commentId }));

    await run(reopenComment(repo, { author: {}, commentId }));

    const comments = await run(listComments(repo, { status: [] }));
    const reopened = comments.find((comment) => comment.id === commentId);
    expect(reopened?.status).toBe("open");
  });
});
