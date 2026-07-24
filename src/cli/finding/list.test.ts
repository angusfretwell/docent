import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { FoldedFinding } from "@shared/lib/finding";
import { cleanupScratchDirs, git, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { WorkingDirectory } from "../usage";
import { findingCommand } from "./index";
import { applyFindingFilter } from "./list";
import { addFinding, resolveFinding } from "./write";

function folded(
  overrides: Partial<Omit<FoldedFinding, "id">> & { id?: string }
): FoldedFinding {
  return {
    body: "",
    id: "fnd_x",
    participants: [],
    replies: [],
    status: "open",
    ...overrides,
  } as FoldedFinding;
}

describe("applyFindingFilter", () => {
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
      applyFindingFilter(all, { status: ["resolved"] }).map(
        (finding) => finding.id as string
      )
    ).toEqual(["closed"]);
  });

  test("an empty status keeps every finding", () => {
    expect(applyFindingFilter(all, { status: [] })).toHaveLength(all.length);
  });

  test("the unresolved queue is open plus actioned", () => {
    expect(
      applyFindingFilter(all, { status: ["open", "actioned"] }).map(
        (finding) => finding.id as string
      )
    ).toEqual(["open", "actioned", "onFile", "byAgent"]);
  });

  test("anchor-file narrows to the code arm's file", () => {
    expect(
      applyFindingFilter(all, { anchorFile: "src/a.ts", status: [] }).map(
        (finding) => finding.id as string
      )
    ).toEqual(["onFile"]);
  });

  test("author narrows to a participant id", () => {
    expect(
      applyFindingFilter(all, { author: "claude", status: [] }).map(
        (finding) => finding.id as string
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

function findingCli(cwd: string, argv: readonly string[]) {
  return Command.runWith(findingCommand, { version: "test" })(argv).pipe(
    Effect.provideService(WorkingDirectory, cwd)
  );
}

async function listed(cwd: string, argv: readonly string[]): Promise<string[]> {
  const printed: string[] = [];
  await run(
    findingCli(cwd, ["list", ...argv]).pipe(
      Effect.provideService(Console.Console, {
        ...globalThis.console,
        log: (...args: unknown[]) => {
          printed.push(args.join(" "));
        },
      })
    )
  );
  const result = JSON.parse(printed.join("\n")) as {
    findings: { body: string }[];
  };
  return result.findings.map((entry) => entry.body);
}

async function seededRepo(): Promise<string> {
  const dir = scratchRepo("docent-list-cli-");
  git(dir, "checkout", "-b", "feature");
  writeFileSync(path.join(dir, "feature.ts"), "export const x = 1;\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "add feature");

  await run(
    addFinding(dir, {
      anchor: { kind: "change" },
      author: {},
      body: "still-open",
    })
  );
  const closed = await run(
    addFinding(dir, { anchor: { kind: "change" }, author: {}, body: "closed" })
  );
  await run(resolveFinding(dir, { author: {}, findingId: closed.findingId }));

  return dir;
}

describe("docent finding list — the argv surface", () => {
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
      findingCli(repo, ["list", "--status", "bogus"]).pipe(Effect.flip)
    );

    expect(error.message).toBe(
      "unknown --status: bogus (one of actioned, open, resolved)"
    );
  });

  test("a stray positional is refused, never answered as the whole queue", async () => {
    const repo = await seededRepo();

    const error = await run(
      findingCli(repo, ["list", "open"]).pipe(Effect.flip)
    );

    expect(error.message).toBe("unexpected argument: open");
  });
});
