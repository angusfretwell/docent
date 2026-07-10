import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";
import { ViewedRequest } from "../shared/dossier.ts";
import {
  appendViewedEvent,
  branchSlug,
  ensureGitignore,
  parseAnchor,
  readDossierSnapshot,
} from "./dossier.ts";
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

  test("walks findings record directories", async () => {
    const root = scratchDir("docent-dossier-");
    await snapshot(root, "feature");
    const fndDir = path.join(root, ".docent", "dossiers", "feature", "findings", "fnd_01J9GQ4W7X");
    mkdirSync(fndDir, { recursive: true });
    writeFileSync(path.join(fndDir, "001-open.md"), "---\n---\nbody\n");
    writeFileSync(path.join(fndDir, "002-reply.md"), "---\n---\nreply\n");

    const snap = await snapshot(root, "feature");

    expect(snap.findings).toEqual([
      { id: "fnd_01J9GQ4W7X", records: ["001-open.md", "002-reply.md"] },
    ]);
  });

  test("folds the root record's anchored file for the has-findings filter", async () => {
    const root = scratchDir("docent-dossier-");
    await snapshot(root, "feature");
    const fndDir = path.join(root, ".docent", "dossiers", "feature", "findings", "fnd_ANCHORED");
    mkdirSync(fndDir, { recursive: true });
    writeFileSync(
      path.join(fndDir, "001-open.md"),
      `---
schema: docent/finding@3
anchor: { kind: line, file: src/parser/stream.ts, side: head, blobSha: 9c2a1f0, lines: [42, 47] }
---

body
`,
    );

    const snap = await snapshot(root, "feature");

    expect(snap.findings[0]).toMatchObject({
      anchorFile: "src/parser/stream.ts",
      anchorKind: "line",
      id: "fnd_ANCHORED",
    });
  });
});

describe("parseAnchor", () => {
  test("lifts file and kind from a line-arm anchor", () => {
    const md = "---\nanchor: { kind: line, file: src/app.ts, side: head, lines: [1, 2] }\n---\n";

    expect(parseAnchor(md)).toEqual({ anchorFile: "src/app.ts", anchorKind: "line" });
  });

  test("a change-arm anchor has no file", () => {
    expect(parseAnchor("---\nanchor: { kind: change }\n---\n")).toEqual({ anchorKind: "change" });
  });

  test("no frontmatter or no anchor yields empty", () => {
    expect(parseAnchor("just a body")).toEqual({});
    expect(parseAnchor("---\nschema: docent/finding@3\n---\nbody")).toEqual({});
  });

  test("does not leak a file key from beyond the anchor object", () => {
    const md = "---\nanchor: { kind: change }\nother: { file: nope.ts }\n---\n";

    expect(parseAnchor(md)).toEqual({ anchorKind: "change" });
  });
});

describe("appendViewedEvent", () => {
  function mark(root: string, branch: string, filePath: string, blobSha: string) {
    return runtime.runPromise(
      appendViewedEvent({
        base: "main",
        branch,
        request: ViewedRequest.make({ blobSha, path: filePath }),
        root,
      }),
    );
  }

  test("writes a {path, blobSha, ts} event that the snapshot reads back", async () => {
    const root = scratchDir("docent-dossier-");

    const event = await mark(root, "feature", "src/app.ts", "9c2a1f0");

    expect(event.path).toBe("src/app.ts");
    expect(event.blobSha).toBe("9c2a1f0");
    expect(event.ts).not.toBe("");
    const snap = await snapshot(root, "feature");
    expect(snap.viewed).toEqual([{ blobSha: "9c2a1f0", path: "src/app.ts", ts: event.ts }]);
  });

  test("is append-only: a re-mark adds a second event (parity toggle)", async () => {
    const root = scratchDir("docent-dossier-");

    await mark(root, "feature", "src/app.ts", "9c2a1f0");
    await mark(root, "feature", "src/app.ts", "9c2a1f0");

    const snap = await snapshot(root, "feature");
    const forFile = snap.viewed.filter((v) => v.path === "src/app.ts");
    expect(forFile).toHaveLength(2);
  });

  test("auto-creates the Dossier so the first mark has a home", async () => {
    const root = scratchDir("docent-dossier-");

    await mark(root, "fresh", "a.ts", "aaa");

    expect(existsSync(path.join(root, ".docent", "dossiers", "fresh", "dossier.json"))).toBe(true);
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
