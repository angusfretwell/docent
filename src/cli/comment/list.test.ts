import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { FoldedComment } from "@shared/lib/comment";
import { cleanupScratchDirs, git, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { WorkingDirectory } from "../usage";
import { commentCommand } from "./index";
import { applyCommentFilter } from "./list";
import { addComment, resolveComment } from "./write";

function folded(
  overrides: Partial<Omit<FoldedComment, "id">> & { id?: string }
): FoldedComment {
  return {
    body: "",
    id: "cmt_x",
    participants: [],
    replies: [],
    status: "open",
    ...overrides,
  } as FoldedComment;
}

describe("applyCommentFilter", () => {
  const open = folded({ id: "open", status: "open" });
  const actioned = folded({ id: "actioned", status: "actioned" });
  const closed = folded({ id: "closed", status: "resolved" });
  const onFile = folded({
    anchor: {
      blobSha: "s",
      file: "src/a.ts",
      kind: "line",
      lines: [1, 2],
      side: "head",
    },
    id: "onFile",
  });
  const byAgent = folded({
    id: "byAgent",
    participants: [{ display: "Claude", id: "claude", kind: "agent" }],
  });
  const all = [open, actioned, closed, onFile, byAgent];

  test("status any-of narrows", () => {
    expect(
      applyCommentFilter(all, { status: ["resolved"] }).map(
        (comment) => comment.id as string
      )
    ).toEqual(["closed"]);
  });

  test("an empty status keeps every comment", () => {
    expect(applyCommentFilter(all, { status: [] })).toHaveLength(all.length);
  });

  test("the unresolved queue is open plus actioned", () => {
    expect(
      applyCommentFilter(all, { status: ["open", "actioned"] }).map(
        (comment) => comment.id as string
      )
    ).toEqual(["open", "actioned", "onFile", "byAgent"]);
  });

  test("anchor-file narrows to the code arm's file", () => {
    expect(
      applyCommentFilter(all, { anchorFile: "src/a.ts", status: [] }).map(
        (comment) => comment.id as string
      )
    ).toEqual(["onFile"]);
  });

  test("author narrows to a participant id", () => {
    expect(
      applyCommentFilter(all, { author: "claude", status: [] }).map(
        (comment) => comment.id as string
      )
    ).toEqual(["byAgent"]);
  });
});

const runtime = makeTestRuntime();
const run = runtime.runPromise;

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function commentCli(cwd: string, argv: readonly string[]) {
  return Command.runWith(commentCommand, { version: "test" })(argv).pipe(
    Effect.provideService(WorkingDirectory, cwd)
  );
}

async function listed(cwd: string, argv: readonly string[]): Promise<string[]> {
  const printed: string[] = [];
  await run(
    commentCli(cwd, ["list", ...argv]).pipe(
      Effect.provideService(Console.Console, {
        ...globalThis.console,
        log: (...args: unknown[]) => {
          printed.push(args.join(" "));
        },
      })
    )
  );
  const result = JSON.parse(printed.join("\n")) as {
    comments: { body: string }[];
  };
  return result.comments.map((entry) => entry.body);
}

async function seededRepo(): Promise<string> {
  const dir = scratchRepo("docent-list-cli-");
  git(dir, "checkout", "-b", "feature");
  writeFileSync(path.join(dir, "feature.ts"), "export const x = 1;\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "add feature");

  await run(
    addComment(dir, {
      anchor: { kind: "change" },
      author: {},
      body: "still-open",
    })
  );
  const closed = await run(
    addComment(dir, { anchor: { kind: "change" }, author: {}, body: "closed" })
  );
  await run(resolveComment(dir, { author: {}, commentId: closed.commentId }));

  return dir;
}

describe("docent comment list — the argv surface", () => {
  test("--status comma-joins and repeats to the same any-of filter", async () => {
    const repo = await seededRepo();

    const commaJoined = await listed(repo, ["--status", "open,resolved"]);
    const repeated = await listed(repo, [
      "--status",
      "open",
      "--status",
      "resolved",
    ]);

    expect(commaJoined.toSorted()).toEqual(["closed", "still-open"]);
    expect(repeated).toEqual(commaJoined);
  });

  test("--status narrows to the named status alone", async () => {
    const repo = await seededRepo();

    expect(await listed(repo, ["--status", "resolved"])).toEqual(["closed"]);
  });

  test("an unknown --status value is refused, never silently ignored", async () => {
    const repo = await seededRepo();

    const error = await run(
      commentCli(repo, ["list", "--status", "bogus"]).pipe(Effect.flip)
    );

    expect(error.message).toBe(
      "unknown --status: bogus (one of actioned, open, resolved)"
    );
  });
});
