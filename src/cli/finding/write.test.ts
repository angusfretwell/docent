import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { cleanupScratchDirs, git, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Effect } from "effect";

import { listFindings } from "./list";
import type { AnchorFlags } from "./write";
import {
  actionFinding,
  addFinding,
  buildAuthor,
  editFinding,
  parseAnchorSpec,
  reopenFinding,
  replyFinding,
  resolveFinding,
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
    expect(result.changeId as string).toBe("chg_001");

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
});
