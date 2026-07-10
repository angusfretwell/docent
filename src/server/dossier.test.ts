import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";
import { branchSlug, ensureGitignore, readDossierSnapshot } from "./dossier.ts";
import { cleanupScratchDirs, scratchDir } from "./test-fixtures.ts";

const runtime = ManagedRuntime.make(BunServices.layer);

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function snapshot(root: string, branch: string, base = "main") {
  return runtime.runPromise(readDossierSnapshot({ base, branch, root }));
}

describe("branchSlug", () => {
  test("maps slashes to dashes", () => {
    expect(branchSlug("feat/stream")).toBe("feat-stream");
    expect(branchSlug("a/b/c")).toBe("a-b-c");
    expect(branchSlug("main")).toBe("main");
  });
});

describe("readDossierSnapshot", () => {
  test("auto-creates dossier.json on first use", async () => {
    const root = scratchDir("docent-dossier-");

    const snap = await snapshot(root, "feature", "trunk");

    expect(snap.dossier.schema).toBe("docent/dossier@3");
    expect(snap.dossier.branch).toBe("feature");
    expect(snap.dossier.base).toBe("trunk");
    expect(snap.dossier.id).not.toBe("");
    const file = path.join(root, ".docent", "dossiers", "feature", "dossier.json");
    expect(existsSync(file)).toBe(true);
    const onDisk = JSON.parse(readFileSync(file, "utf-8"));
    expect(onDisk.branch).toBe("feature");
  });

  test("slugs the branch dir but keeps the real branch name", async () => {
    const root = scratchDir("docent-dossier-");

    const snap = await snapshot(root, "feat/stream");

    expect(snap.dossier.branch).toBe("feat/stream");
    expect(existsSync(path.join(root, ".docent", "dossiers", "feat-stream", "dossier.json"))).toBe(
      true,
    );
  });

  test("keeps the id stable across reads (no regenerate)", async () => {
    const root = scratchDir("docent-dossier-");

    const first = await snapshot(root, "feature");
    const second = await snapshot(root, "feature");

    expect(second.dossier.id).toBe(first.dossier.id);
  });

  test("walks the changes/ log", async () => {
    const root = scratchDir("docent-dossier-");
    await snapshot(root, "feature");
    const changesDir = path.join(root, ".docent", "dossiers", "feature", "changes");
    mkdirSync(changesDir, { recursive: true });
    writeFileSync(
      path.join(changesDir, "chg_001.json"),
      JSON.stringify({
        baseRef: "main",
        baseSha: "aaa",
        capturedAt: "2026-07-10T02:14:00Z",
        headRef: "feature",
        headSha: "bbb",
        id: "chg_001",
        schema: "docent/change@3",
      }),
    );

    const snap = await snapshot(root, "feature");

    expect(snap.changes.map((c) => c.id)).toEqual(["chg_001"]);
  });

  test("degrades gracefully: a malformed record never breaks the snapshot", async () => {
    const root = scratchDir("docent-dossier-");
    await snapshot(root, "feature");
    const changesDir = path.join(root, ".docent", "dossiers", "feature", "changes");
    mkdirSync(changesDir, { recursive: true });
    writeFileSync(path.join(changesDir, "chg_001.json"), "{ not valid json");
    writeFileSync(
      path.join(changesDir, "chg_002.json"),
      JSON.stringify({
        baseRef: "main",
        baseSha: "aaa",
        capturedAt: "2026-07-10T02:14:00Z",
        headRef: "feature",
        headSha: "bbb",
        id: "chg_002",
        schema: "docent/change@3",
      }),
    );

    const snap = await snapshot(root, "feature");

    expect(snap.changes.map((c) => c.id)).toEqual(["chg_002"]);
  });

  test("parses findings records: envelope, anchor, body, and type", async () => {
    const root = scratchDir("docent-dossier-");
    await snapshot(root, "feature");
    const fndDir = path.join(root, ".docent", "dossiers", "feature", "findings", "fnd_01J9GQ4W7X");
    mkdirSync(fndDir, { recursive: true });
    writeFileSync(
      path.join(fndDir, "001-open.md"),
      [
        "---",
        "schema: docent/finding@3",
        'author: { kind: agent, id: claude-code, display: "Claude Code" }',
        "changeId: chg_001",
        "createdAt: 2026-07-10T02:14:00Z",
        "anchor: { kind: line, file: src/x.ts, side: head, blobSha: 9c2a, lines: [42, 47] }",
        "---",
        "",
        "the flush races the mark",
        "",
      ].join("\n"),
    );
    writeFileSync(
      path.join(fndDir, "002-reply.md"),
      [
        "---",
        "schema: docent/finding@3",
        'author: { kind: human, id: angusfretwell@me.com, display: "Angus" }',
        "changeId: chg_002",
        "createdAt: 2026-07-10T03:02:11Z",
        "disposition: actioned",
        "---",
        "",
        "fixed",
        "",
      ].join("\n"),
    );

    const snap = await snapshot(root, "feature");

    const finding = snap.findings.at(0);
    if (finding === undefined) {
      throw new Error("expected a finding");
    }
    expect(finding.id).toBe("fnd_01J9GQ4W7X");
    expect(finding.records).toMatchObject([
      {
        anchor: { file: "src/x.ts", kind: "line", lines: [42, 47] },
        author: { id: "claude-code", kind: "agent" },
        body: "the flush races the mark",
        type: "open",
      },
      { body: "fixed", disposition: "actioned", type: "reply" },
    ]);
  });

  test("degrades gracefully: a malformed record is skipped, its finding survives", async () => {
    const root = scratchDir("docent-dossier-");
    await snapshot(root, "feature");
    const fndDir = path.join(root, ".docent", "dossiers", "feature", "findings", "fnd_02");
    mkdirSync(fndDir, { recursive: true });
    writeFileSync(path.join(fndDir, "001-open.md"), "no frontmatter here\n");
    writeFileSync(
      path.join(fndDir, "002-reply.md"),
      [
        "---",
        "schema: docent/finding@3",
        'author: { kind: human, id: angusfretwell@me.com, display: "Angus" }',
        "changeId: chg_001",
        "createdAt: 2026-07-10T03:02:11Z",
        "---",
        "",
        "still here",
        "",
      ].join("\n"),
    );

    const snap = await snapshot(root, "feature");

    const finding = snap.findings.at(0);
    if (finding === undefined) {
      throw new Error("expected a finding");
    }
    expect(finding.records.map((record) => record.type)).toEqual(["reply"]);
  });
});

describe("ensureGitignore", () => {
  test("adds .docent/ to a fresh .gitignore", async () => {
    const root = scratchDir("docent-dossier-");

    await runtime.runPromise(ensureGitignore(root));

    expect(readFileSync(path.join(root, ".gitignore"), "utf-8")).toContain(".docent/");
  });

  test("is idempotent when .docent/ is already ignored", async () => {
    const root = scratchDir("docent-dossier-");
    writeFileSync(path.join(root, ".gitignore"), "node_modules\n.docent/\n");

    await runtime.runPromise(ensureGitignore(root));

    const body = readFileSync(path.join(root, ".gitignore"), "utf-8");
    expect(body.match(/\.docent\//g)?.length).toBe(1);
  });
});
