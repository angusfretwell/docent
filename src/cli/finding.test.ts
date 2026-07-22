import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { FoldedFinding } from "@shared/lib/finding";
import { Effect } from "effect";

import { cleanupScratchDirs, git, scratchRepo } from "../core/test-fixtures";
import { makeTestRuntime } from "../test-support/runtime";
import { CliUsageError, parseArgs } from "./args";
import {
  actionFinding,
  addFinding,
  applyFindingFilter,
  buildAuthor,
  editFinding,
  listFindings,
  parseAnchorSpec,
  parseListArgs,
  reopenFinding,
  replyFinding,
  resolveFinding,
  runFinding,
} from "./finding";

const runtime = makeTestRuntime();

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
  const exit = Effect.runSyncExit(
    parseAnchorSpec(parseArgs(args, new Set(["change"])))
  );
  return exit._tag === "Failure";
}

/** A minimal folded Finding for pure-filter tests. */
function folded(overrides: Partial<FoldedFinding>): FoldedFinding {
  return {
    body: "",
    id: "fnd_x",
    participants: [],
    replies: [],
    status: "open",
    ...overrides,
  };
}

describe("parseListArgs", () => {
  test("splits comma and repeated --status", () => {
    expect(parseListArgs(["--status", "open,resolved"]).status).toEqual([
      "open",
      "resolved",
    ]);
  });

  test("no --status keeps every status", () => {
    expect(parseListArgs([]).status).toEqual([]);
  });

  test("rejects an unknown status value", () => {
    expect(() => parseListArgs(["--status", "nonsense"])).toThrow(
      CliUsageError
    );
  });

  test("carries anchor-file and author scope", () => {
    const filter = parseListArgs([
      "--anchor-file",
      "src/a.ts",
      "--author",
      "claude",
    ]);

    expect(filter.anchorFile).toBe("src/a.ts");
    expect(filter.author).toBe("claude");
  });
});

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
        (finding) => finding.id
      )
    ).toEqual(["closed"]);
  });

  test("an empty status keeps every finding", () => {
    expect(applyFindingFilter(all, { status: [] })).toHaveLength(all.length);
  });

  test("the unresolved queue is open plus actioned", () => {
    expect(
      applyFindingFilter(all, { status: ["open", "actioned"] }).map(
        (finding) => finding.id
      )
    ).toEqual(["open", "actioned", "onFile", "byAgent"]);
  });

  test("anchor-file narrows to the code arm's file", () => {
    expect(
      applyFindingFilter(all, { anchorFile: "src/a.ts", status: [] }).map(
        (finding) => finding.id
      )
    ).toEqual(["onFile"]);
  });

  test("author narrows to a participant id", () => {
    expect(
      applyFindingFilter(all, { author: "claude", status: [] }).map(
        (finding) => finding.id
      )
    ).toEqual(["byAgent"]);
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
    expect(anchorSpec(["--file", "src/a.ts", "--line", "42:47"])).toMatchObject(
      {
        kind: "line",
        lines: [42, 47],
      }
    );
    expect(anchorSpec(["--file", "src/a.ts", "--line", "3-9"])).toMatchObject({
      lines: [3, 9],
    });
    expect(anchorSpec(["--file", "src/a.ts", "--line", "5"])).toMatchObject({
      lines: [5, 5],
    });
  });

  test("--anchor passes a raw arm through schema validation", () => {
    expect(anchorSpec(['--anchor={"kind":"change"}'])).toEqual({
      anchor: { kind: "change" },
      kind: "raw",
    });
  });

  test("a bad --line, --side, --anchor, or no anchor is a usage error", () => {
    expect(anchorSpecFails(["--file", "a.ts", "--line", "nope"])).toBe(true);
    expect(anchorSpecFails(["--file", "a.ts", "--side", "sideways"])).toBe(
      true
    );
    expect(anchorSpecFails(['--anchor={"kind":"bogus"}'])).toBe(true);
    expect(anchorSpecFails([])).toBe(true);
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

  test("add mints an anchored finding, resolving the code arm's blobSha from git", async () => {
    const repo = featureRepo();

    const result = await run(
      addFinding(repo, {
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

    expect(result.findingId).toMatch(/^fnd_/);
    expect(result.record).toBe("001-open.md");
    expect(result.changeId).toBe("chg_001");

    const findings = await run(listFindings(repo, { status: [] }));
    const finding = findings.at(0);
    expect(finding?.anchor?.kind).toBe("line");
    if (finding?.anchor?.kind === "line") {
      expect(finding.anchor.blobSha).toMatch(/^[0-9a-f]{40}/);
    }
    expect(finding?.participants.at(0)).toMatchObject({
      id: "claude-code",
      kind: "agent",
    });
  });

  test("action hands the finding back; resolve closes it", async () => {
    const repo = featureRepo();
    const { findingId } = await run(
      addFinding(repo, {
        anchor: { kind: "change" },
        author: {},
        body: "whole-change note",
      })
    );

    await run(
      replyFinding(repo, {
        author: { agent: "fixer" },
        body: "done",
        findingId,
      })
    );
    await run(actionFinding(repo, { author: { agent: "fixer" }, findingId }));
    const afterAction = await run(listFindings(repo, { status: [] }));
    expect(
      afterAction.find((finding) => finding.id === findingId)?.status
    ).toBe("actioned");

    await run(resolveFinding(repo, { author: {}, findingId }));
    const afterResolve = await run(listFindings(repo, { status: [] }));
    expect(
      afterResolve.find((finding) => finding.id === findingId)?.status
    ).toBe("resolved");
  });

  test("list filters on status, anchor-file, and author", async () => {
    const repo = featureRepo();
    await run(
      addFinding(repo, {
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
    const { findingId } = await run(
      addFinding(repo, {
        anchor: { kind: "change" },
        author: { agent: "other" },
        body: "whole",
      })
    );
    await run(resolveFinding(repo, { author: {}, findingId }));

    const open = await run(listFindings(repo, { status: ["open"] }));
    const resolved = await run(listFindings(repo, { status: ["resolved"] }));
    const onFile = await run(
      listFindings(repo, { anchorFile: "feature.ts", status: [] })
    );
    const byReviewer = await run(
      listFindings(repo, { author: "reviewer", status: [] })
    );

    expect(open).toHaveLength(1);
    expect(resolved).toHaveLength(1);
    expect(onFile).toHaveLength(1);
    expect(byReviewer).toHaveLength(1);
  });

  test("reopen returns a resolved finding to open", async () => {
    const repo = featureRepo();
    const { findingId } = await run(
      addFinding(repo, {
        anchor: { kind: "change" },
        author: {},
        body: "flagged",
      })
    );
    await run(resolveFinding(repo, { author: {}, findingId }));

    await run(reopenFinding(repo, { author: {}, findingId }));

    const findings = await run(listFindings(repo, { status: [] }));
    const reopened = findings.find((finding) => finding.id === findingId);
    expect(reopened?.status).toBe("open");
  });

  test("edit supersedes the named record's body", async () => {
    const repo = featureRepo();
    const { findingId, record } = await run(
      addFinding(repo, {
        anchor: { kind: "change" },
        author: {},
        body: "the flush races",
      })
    );

    await run(
      editFinding(repo, {
        author: {},
        body: "the flush races the drain",
        edits: record,
        findingId,
      })
    );

    const findings = await run(listFindings(repo, { status: [] }));
    const edited = findings.find((finding) => finding.id === findingId);
    expect(edited?.body).toBe("the flush races the drain");
  });

  test("edit dispatched through argv requires --finding and --record", async () => {
    const repo = featureRepo();
    const { findingId, record } = await run(
      addFinding(repo, {
        anchor: { kind: "change" },
        author: {},
        body: "original",
      })
    );

    await run(
      runFinding(repo, [
        "edit",
        "--finding",
        findingId,
        "--record",
        record,
        "--body",
        "revised",
      ])
    );
    const missingRecord = await runtime.runPromiseExit(
      runFinding(repo, ["edit", "--finding", findingId, "--body", "x"])
    );

    const findings = await run(listFindings(repo, { status: [] }));
    expect(findings.find((finding) => finding.id === findingId)?.body).toBe(
      "revised"
    );
    expect(missingRecord._tag).toBe("Failure");
  });

  test("reply with a missing or empty --finding is a usage error (never a stray write)", async () => {
    const repo = featureRepo();

    const missing = await runtime.runPromiseExit(
      runFinding(repo, ["reply", "--body", "x"])
    );
    const empty = await runtime.runPromiseExit(
      runFinding(repo, ["reply", "--finding", "", "--body", "x"])
    );

    expect(missing._tag).toBe("Failure");
    expect(empty._tag).toBe("Failure");
  });
});
