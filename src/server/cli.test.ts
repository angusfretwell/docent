import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { BunServices } from "@effect/platform-bun";
import { Effect, ManagedRuntime } from "effect";
import type { FoldedFinding } from "../shared/finding.ts";
import {
  addFinding,
  applyFindingFilter,
  buildAuthor,
  CliUsageError,
  listFindings,
  parseAnchorSpec,
  parseArgs,
  parseAuthorOpts,
  parseListArgs,
  replyFinding,
  resolveFinding,
  runFinding,
} from "./cli.ts";
import { cleanupScratchDirs, git, scratchRepo } from "./test-fixtures.ts";

const runtime = ManagedRuntime.make(BunServices.layer);

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

/** A scratch repo on `feature`, one file changed off `main`. */
function featureRepo(): string {
  const dir = scratchRepo("docent-cli-test-");
  git(dir, "checkout", "-b", "feature");
  writeFileSync(path.join(dir, "feature.ts"), "export const x = 1;\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "add feature");
  return dir;
}

/** Parse an anchor spec straight from argv (no git needed for the spec). */
function anchorSpec(args: string[]) {
  return Effect.runSync(parseAnchorSpec(parseArgs(args, new Set(["change"]))));
}

/** Whether parsing an anchor spec from argv fails. */
function anchorSpecFails(args: string[]): boolean {
  const exit = Effect.runSyncExit(parseAnchorSpec(parseArgs(args, new Set(["change"]))));
  return exit._tag === "Failure";
}

/** A minimal folded Finding for pure-filter tests. */
function folded(overrides: Partial<FoldedFinding>): FoldedFinding {
  return {
    body: "",
    id: "fnd_x",
    participants: [],
    replies: [],
    resolved: false,
    whatsNext: "needs-action",
    ...overrides,
  };
}

describe("parseArgs", () => {
  test("splits --flag value, --flag=value, and bare booleans", () => {
    const parsed = parseArgs(["--file", "a.ts", "--side=head", "--change"], new Set(["change"]));

    expect(parsed.values.get("file")).toEqual(["a.ts"]);
    expect(parsed.values.get("side")).toEqual(["head"]);
    expect(parsed.bools.has("change")).toBe(true);
  });

  test("accumulates a repeated flag", () => {
    const parsed = parseArgs(["--whats-next", "needs-action", "--whats-next", "closed"], new Set());

    expect(parsed.values.get("whats-next")).toEqual(["needs-action", "closed"]);
  });

  test("rejects a stray positional", () => {
    expect(() => parseArgs(["oops"], new Set())).toThrow(CliUsageError);
  });
});

describe("parseListArgs", () => {
  test("--open and --resolved together clear the status filter", () => {
    expect(parseListArgs(["--open", "--resolved"]).status).toBeUndefined();
    expect(parseListArgs(["--open"]).status).toBe("open");
    expect(parseListArgs(["--resolved"]).status).toBe("resolved");
  });

  test("splits comma and repeated --whats-next", () => {
    expect(parseListArgs(["--whats-next", "needs-action,closed"]).whatsNext).toEqual([
      "needs-action",
      "closed",
    ]);
  });

  test("rejects an unknown what's-next value", () => {
    expect(() => parseListArgs(["--whats-next", "nonsense"])).toThrow(CliUsageError);
  });

  test("carries anchor-file and author scope", () => {
    const filter = parseListArgs(["--anchor-file", "src/a.ts", "--author", "claude"]);

    expect(filter.anchorFile).toBe("src/a.ts");
    expect(filter.author).toBe("claude");
  });
});

describe("applyFindingFilter", () => {
  const open = folded({ id: "open", resolved: false, whatsNext: "needs-action" });
  const closed = folded({ id: "closed", resolved: true, whatsNext: "closed" });
  const onFile = folded({
    anchor: { blobSha: "s", file: "src/a.ts", kind: "line", lines: [1, 2], side: "head" },
    id: "onFile",
  });
  const byAgent = folded({
    id: "byAgent",
    participants: [{ display: "Claude", id: "claude", kind: "agent" }],
  });
  const all = [open, closed, onFile, byAgent];

  test("status open/resolved narrows", () => {
    expect(applyFindingFilter(all, { status: "open", whatsNext: [] }).map((f) => f.id)).toEqual([
      "open",
      "onFile",
      "byAgent",
    ]);
    expect(applyFindingFilter(all, { status: "resolved", whatsNext: [] }).map((f) => f.id)).toEqual(
      ["closed"],
    );
  });

  test("what's-next any-of narrows", () => {
    expect(applyFindingFilter(all, { whatsNext: ["closed"] }).map((f) => f.id)).toEqual(["closed"]);
  });

  test("anchor-file narrows to the code arm's file", () => {
    expect(
      applyFindingFilter(all, { anchorFile: "src/a.ts", whatsNext: [] }).map((f) => f.id),
    ).toEqual(["onFile"]);
  });

  test("author narrows to a participant id", () => {
    expect(applyFindingFilter(all, { author: "claude", whatsNext: [] }).map((f) => f.id)).toEqual([
      "byAgent",
    ]);
  });
});

describe("parseAnchorSpec", () => {
  test("--change builds the whole-change arm", () => {
    expect(anchorSpec(["--change"])).toEqual({ kind: "change" });
  });

  test("--file alone builds a file arm; default side is head", () => {
    expect(anchorSpec(["--file", "src/a.ts"])).toEqual({
      file: "src/a.ts",
      kind: "file",
      side: "head",
    });
  });

  test("--file --line builds a line arm; N:M and N-M and N all parse", () => {
    expect(anchorSpec(["--file", "src/a.ts", "--line", "42:47"])).toMatchObject({
      kind: "line",
      lines: [42, 47],
    });
    expect(anchorSpec(["--file", "src/a.ts", "--line", "3-9"])).toMatchObject({ lines: [3, 9] });
    expect(anchorSpec(["--file", "src/a.ts", "--line", "5"])).toMatchObject({ lines: [5, 5] });
  });

  test("--anchor passes a raw arm through schema validation", () => {
    expect(anchorSpec(['--anchor={"kind":"change"}'])).toEqual({
      anchor: { kind: "change" },
      kind: "raw",
    });
  });

  test("a bad --line, --side, --anchor, or no anchor is a usage error", () => {
    expect(anchorSpecFails(["--file", "a.ts", "--line", "nope"])).toBe(true);
    expect(anchorSpecFails(["--file", "a.ts", "--side", "sideways"])).toBe(true);
    expect(anchorSpecFails(['--anchor={"kind":"bogus"}'])).toBe(true);
    expect(anchorSpecFails([])).toBe(true);
  });
});

describe("buildAuthor", () => {
  test("--agent attributes to an agent slug with optional model", async () => {
    const author = await runtime.runPromise(
      buildAuthor("/tmp", { agent: "claude-code", model: "claude-fable-5" }),
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

  test("add mints an anchored finding, resolving the code arm's blobSha from git", async () => {
    const repo = featureRepo();

    const result = await run(
      addFinding(repo, {
        anchor: { file: "feature.ts", kind: "line", lines: [1, 1], side: "head" },
        author: { agent: "claude-code" },
        body: "this const should be exported lazily",
      }),
    );

    expect(result.findingId).toMatch(/^fnd_/);
    expect(result.record).toBe("001-open.md");
    expect(result.changeId).toBe("chg_001");

    const findings = await run(listFindings(repo, { whatsNext: [] }));
    const finding = findings.at(0);
    expect(finding?.anchor?.kind).toBe("line");
    if (finding?.anchor?.kind === "line") {
      expect(finding.anchor.blobSha).toMatch(/^[0-9a-f]{40}/);
    }
    expect(finding?.participants.at(0)).toMatchObject({ id: "claude-code", kind: "agent" });
  });

  test("reply with a disposition drives what's-next; resolve closes it", async () => {
    const repo = featureRepo();
    const { findingId } = await run(
      addFinding(repo, {
        anchor: { kind: "change" },
        author: {},
        body: "whole-change note",
      }),
    );

    await run(
      replyFinding(repo, {
        author: { agent: "fixer" },
        body: "done",
        disposition: "actioned",
        findingId,
      }),
    );
    const afterReply = await run(listFindings(repo, { whatsNext: [] }));
    expect(afterReply.find((f) => f.id === findingId)?.whatsNext).toBe("needs-verify");

    await run(resolveFinding(repo, { author: {}, body: "verified", findingId }));
    const afterResolve = await run(listFindings(repo, { whatsNext: [] }));
    const closed = afterResolve.find((f) => f.id === findingId);
    expect(closed?.resolved).toBe(true);
    expect(closed?.whatsNext).toBe("closed");
  });

  test("list filters on status, what's-next, anchor-file, and author", async () => {
    const repo = featureRepo();
    await run(
      addFinding(repo, {
        anchor: { file: "feature.ts", kind: "line", lines: [1, 1], side: "head" },
        author: { agent: "reviewer" },
        body: "on the file",
      }),
    );
    const { findingId } = await run(
      addFinding(repo, { anchor: { kind: "change" }, author: { agent: "other" }, body: "whole" }),
    );
    await run(resolveFinding(repo, { author: {}, findingId }));

    const open = await run(listFindings(repo, { status: "open", whatsNext: [] }));
    const resolved = await run(listFindings(repo, { status: "resolved", whatsNext: [] }));
    const onFile = await run(listFindings(repo, { anchorFile: "feature.ts", whatsNext: [] }));
    const byReviewer = await run(listFindings(repo, { author: "reviewer", whatsNext: [] }));
    const closed = await run(listFindings(repo, { whatsNext: ["closed"] }));

    expect(open).toHaveLength(1);
    expect(resolved).toHaveLength(1);
    expect(onFile).toHaveLength(1);
    expect(byReviewer).toHaveLength(1);
    expect(closed).toHaveLength(1);
  });

  test("parseAuthorOpts reads --agent, --display, --model", () => {
    const opts = parseAuthorOpts(
      parseArgs(["--agent", "a", "--display", "Agent A", "--model", "m"], new Set()),
    );

    expect(opts).toEqual({ agent: "a", display: "Agent A", model: "m" });
  });

  test("reply with a missing or empty --finding is a usage error (never a stray write)", async () => {
    const repo = featureRepo();

    const missing = await runtime.runPromiseExit(runFinding(repo, ["reply", "--body", "x"]));
    const empty = await runtime.runPromiseExit(
      runFinding(repo, ["reply", "--finding", "", "--body", "x"]),
    );

    expect(missing._tag).toBe("Failure");
    expect(empty._tag).toBe("Failure");
  });
});
