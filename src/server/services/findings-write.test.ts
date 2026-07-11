import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { BunServices } from "@effect/platform-bun";
import { foldFinding } from "@shared/lib/finding";
import type { FindingWrite } from "@shared/schemas/finding-write";
import { ManagedRuntime } from "effect";

import { cleanupScratchDirs, scratchDir } from "../lib/test-fixtures";
import { mintChange, writeFindingRecord } from "./findings-write";
import { readReviewSnapshot } from "./review";

const runtime = ManagedRuntime.make(BunServices.layer);

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

const REFS = {
  baseRef: "main",
  baseSha: "aaaa",
  headRef: "feature",
  headSha: "bbbb",
};
const angus = {
  display: "Angus",
  id: "angus@example.com",
  kind: "human" as const,
};
const lineAnchor = {
  blobSha: "9c2a1f0",
  file: "src/parser/stream.ts",
  kind: "line" as const,
  lines: [42, 47] as [number, number],
  side: "head" as const,
};

function reviewDir(root: string) {
  return path.join(root, ".docent", "reviews", "feature");
}

function write(root: string, wr: FindingWrite, refs = REFS) {
  return runtime.runPromise(
    writeFindingRecord({
      author: angus,
      base: "main",
      branch: "feature",
      refs,
      root,
      write: wr,
    })
  );
}

function snapshot(root: string) {
  return runtime.runPromise(
    readReviewSnapshot({ base: "main", branch: "feature", root })
  );
}

describe("mintChange", () => {
  function mint(root: string, refs = REFS) {
    return runtime.runPromise(mintChange({ refs, reviewDir: reviewDir(root) }));
  }

  test("mints chg_001 in docent/change@3 shape with base at the merge-base", async () => {
    const root = scratchDir("docent-write-");

    const change = await mint(root);

    expect(change.id).toBe("chg_001");
    expect(change.schema).toBe("docent/change@3");
    expect(change.baseSha).toBe("aaaa");
    expect(change.headSha).toBe("bbbb");
    const file = path.join(reviewDir(root), "changes", "chg_001.json");
    expect(JSON.parse(readFileSync(file, "utf-8")).id).toBe("chg_001");
  });

  test("is idempotent: the same (baseSha, headSha) never mints twice", async () => {
    const root = scratchDir("docent-write-");

    const first = await mint(root);
    const second = await mint(root);

    expect(second.id).toBe(first.id);
    const snap = await snapshot(root);
    expect(snap.changes.map((change) => change.id)).toEqual(["chg_001"]);
  });

  test("a new head mints the next sequential Change", async () => {
    const root = scratchDir("docent-write-");

    await mint(root);
    const next = await mint(root, { ...REFS, headSha: "cccc" });

    expect(next.id).toBe("chg_002");
    const snap = await snapshot(root);
    expect(snap.changes.map((change) => change.id)).toEqual([
      "chg_001",
      "chg_002",
    ]);
  });
});

describe("writeFindingRecord", () => {
  test("open mints a Finding whose root record carries the anchor and changeId", async () => {
    const root = scratchDir("docent-write-");

    const result = await write(root, {
      anchor: lineAnchor,
      body: "the flush races",
      op: "open",
    });

    expect(result.findingId).toMatch(/^fnd_/);
    expect(result.record).toBe("001-open.md");
    expect(result.changeId).toBe("chg_001");

    const snap = await snapshot(root);
    const entry = snap.findings.at(0);
    if (entry === undefined) {
      throw new Error("expected a finding");
    }
    const folded = foldFinding(entry.id, entry.records);
    expect(folded.anchor).toEqual(lineAnchor);
    expect(folded.body).toBe("the flush races");
    const root001 = entry.records.at(0);
    expect(root001?.author).toMatchObject({
      id: "angus@example.com",
      kind: "human",
    });
    expect(root001?.changeId).toBe("chg_001");
  });

  test("file-level and change-level anchors are authorable", async () => {
    const root = scratchDir("docent-write-");

    await write(root, {
      anchor: {
        blobSha: "abc",
        file: "src/main.ts",
        kind: "file",
        side: "head",
      },
      body: "whole file",
      op: "open",
    });
    await write(root, {
      anchor: { kind: "change" },
      body: "whole change",
      op: "open",
    });

    const snap = await snapshot(root);
    const kinds = snap.findings
      .map((entry) => foldFinding(entry.id, entry.records).anchor?.kind)
      .toSorted();
    expect(kinds).toEqual(["change", "file"]);
  });

  test("reply appends the next record and transitions what's-next by disposition", async () => {
    const root = scratchDir("docent-write-");
    const { findingId } = await write(root, {
      anchor: lineAnchor,
      body: "flagged",
      op: "open",
    });

    const reply = await write(root, {
      body: "fixed",
      disposition: "actioned",
      findingId,
      op: "reply",
    });

    expect(reply.record).toBe("002-reply.md");
    const snap = await snapshot(root);
    const entry = snap.findings.find((finding) => finding.id === findingId);
    if (entry === undefined) {
      throw new Error("expected the finding");
    }
    const folded = foldFinding(entry.id, entry.records);
    expect(folded.replies.at(0)).toMatchObject({
      body: "fixed",
      disposition: "actioned",
    });
    expect(folded.whatsNext).toBe("needs-verify");
  });

  test("resolve then reopen fold through the append-only records", async () => {
    const root = scratchDir("docent-write-");
    const { findingId } = await write(root, {
      anchor: lineAnchor,
      body: "flagged",
      op: "open",
    });

    await write(root, {
      body: "verified under load",
      findingId,
      op: "resolve",
    });
    const afterResolve = await snapshot(root);
    const resolvedEntry = afterResolve.findings.find(
      (finding) => finding.id === findingId
    );
    expect(foldFinding(findingId, resolvedEntry?.records ?? []).resolved).toBe(
      true
    );

    await write(root, { findingId, op: "reopen" });
    const afterReopen = await snapshot(root);
    const reopenedEntry = afterReopen.findings.find(
      (finding) => finding.id === findingId
    );
    const folded = foldFinding(findingId, reopenedEntry?.records ?? []);
    expect(folded.resolved).toBe(false);
    expect(folded.whatsNext).toBe("needs-action");
  });

  test("every record stamps the changeId current at write", async () => {
    const root = scratchDir("docent-write-");
    const { findingId } = await write(root, {
      anchor: lineAnchor,
      body: "flagged",
      op: "open",
    });
    // A later record written against a new head stamps the newer Change.
    await write(
      root,
      { body: "fixed", findingId, op: "reply" },
      { ...REFS, headSha: "cccc" }
    );

    const snap = await snapshot(root);
    const entry = snap.findings.find((finding) => finding.id === findingId);
    expect(entry?.records.map((record) => record.changeId)).toEqual([
      "chg_001",
      "chg_002",
    ]);
  });

  test("records are append-only file drops, never rewrites", async () => {
    const root = scratchDir("docent-write-");
    const { findingId } = await write(root, {
      anchor: lineAnchor,
      body: "flagged",
      op: "open",
    });
    await write(root, { body: "one", findingId, op: "reply" });
    await write(root, { body: "two", findingId, op: "reply" });

    const snap = await snapshot(root);
    const entry = snap.findings.find((finding) => finding.id === findingId);
    expect(entry?.records.map((record) => record.name)).toEqual([
      "001-open.md",
      "002-reply.md",
      "003-reply.md",
    ]);
  });
});
