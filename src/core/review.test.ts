import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { WalkthroughKind } from "@shared/enums/walkthrough-kind";
import { ViewedRequest } from "@shared/schemas/review";
import { cleanupScratchDirs, scratchDir } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";

import {
  appendViewedEvent,
  parseAnchor,
  readReviewSnapshot,
  setReviewTitle,
} from "./review";

const runtime = makeTestRuntime();

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function snapshot(root: string, branch: string, base = "main") {
  return runtime.runPromise(readReviewSnapshot({ base, branch, root }));
}

describe("readReviewSnapshot", () => {
  test("auto-creates review.json on first use", async () => {
    const root = scratchDir("docent-review-");

    const snap = await snapshot(root, "feature", "trunk");

    expect(snap.review.schema).toBe("docent/review");
    expect(snap.review.branch).toBe("feature");
    expect(snap.review.base).toBe("trunk");
    expect(snap.review.id).not.toBe("");
    const file = path.join(
      root,
      ".docent",
      "reviews",
      "feature",
      "review.json"
    );
    expect(existsSync(file)).toBe(true);
    const onDisk = JSON.parse(readFileSync(file, "utf-8"));
    expect(onDisk.branch).toBe("feature");
  });

  test("slugs the branch dir but keeps the real branch name", async () => {
    const root = scratchDir("docent-review-");

    const snap = await snapshot(root, "feat/stream");

    expect(snap.review.branch).toBe("feat/stream");
    expect(
      existsSync(
        path.join(root, ".docent", "reviews", "feat-stream", "review.json")
      )
    ).toBe(true);
  });

  test("auto-creates without a title", async () => {
    const root = scratchDir("docent-review-");

    const snap = await snapshot(root, "feature");

    expect(snap.review.title).toBe("");
  });

  test("keeps the id stable across reads (no regenerate)", async () => {
    const root = scratchDir("docent-review-");

    const first = await snapshot(root, "feature");
    const second = await snapshot(root, "feature");

    expect(second.review.id).toBe(first.review.id);
  });

  test("walks the changes/ log", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    const changesDir = path.join(
      root,
      ".docent",
      "reviews",
      "feature",
      "changes"
    );
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
        schema: "docent/change",
      })
    );

    const snap = await snapshot(root, "feature");

    expect(snap.changes.map((c) => c.id as string)).toEqual(["chg_001"]);
  });

  test("degrades gracefully: a malformed record never breaks the snapshot", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    const changesDir = path.join(
      root,
      ".docent",
      "reviews",
      "feature",
      "changes"
    );
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
        schema: "docent/change",
      })
    );

    const snap = await snapshot(root, "feature");

    expect(snap.changes.map((c) => c.id as string)).toEqual(["chg_002"]);
  });

  test("parses findings records: envelope, anchor, body, and type", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    const fndDir = path.join(
      root,
      ".docent",
      "reviews",
      "feature",
      "findings",
      "fnd_01J9GQ4W7X"
    );
    mkdirSync(fndDir, { recursive: true });
    writeFileSync(
      path.join(fndDir, "001-open.md"),
      [
        "---",
        "schema: docent/finding",
        'author: { kind: agent, id: claude-code, display: "Claude Code" }',
        "changeId: chg_001",
        "createdAt: 2026-07-10T02:14:00Z",
        "anchor: { kind: line, file: src/x.ts, side: head, blobSha: 9c2a, lines: [42, 47] }",
        "---",
        "",
        "the flush races the mark",
        "",
      ].join("\n")
    );
    writeFileSync(
      path.join(fndDir, "002-reply.md"),
      [
        "---",
        "schema: docent/finding",
        'author: { kind: human, id: angusfretwell@me.com, display: "Angus" }',
        "changeId: chg_002",
        "createdAt: 2026-07-10T03:02:11Z",
        "---",
        "",
        "fixed",
        "",
      ].join("\n")
    );

    const snap = await snapshot(root, "feature");

    const finding = snap.findings.at(0);
    if (finding === undefined) {
      throw new Error("expected a finding");
    }
    expect(finding.id as string).toBe("fnd_01J9GQ4W7X");
    expect(finding.records).toMatchObject([
      {
        anchor: { file: "src/x.ts", kind: "line", lines: [42, 47] },
        author: { id: "claude-code", kind: "agent" },
        body: "the flush races the mark",
        type: "open",
      },
      { body: "fixed", type: "reply" },
    ]);
  });

  test("folds the root record's anchored file for the has-findings filter", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    const fndDir = path.join(
      root,
      ".docent",
      "reviews",
      "feature",
      "findings",
      "fnd_ANCHORED"
    );
    mkdirSync(fndDir, { recursive: true });
    writeFileSync(
      path.join(fndDir, "001-open.md"),
      `---
schema: docent/finding
anchor: { kind: line, file: src/parser/stream.ts, side: head, blobSha: 9c2a1f0, lines: [42, 47] }
---

body
`
    );

    const snap = await snapshot(root, "feature");

    expect(snap.findings[0]).toMatchObject({
      anchorFile: "src/parser/stream.ts",
      id: "fnd_ANCHORED",
    });
  });

  test("degrades gracefully: a malformed record is skipped, its finding survives", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    const fndDir = path.join(
      root,
      ".docent",
      "reviews",
      "feature",
      "findings",
      "fnd_02"
    );
    mkdirSync(fndDir, { recursive: true });
    writeFileSync(path.join(fndDir, "001-open.md"), "no frontmatter here\n");
    writeFileSync(
      path.join(fndDir, "002-reply.md"),
      [
        "---",
        "schema: docent/finding",
        'author: { kind: human, id: angusfretwell@me.com, display: "Angus" }',
        "changeId: chg_001",
        "createdAt: 2026-07-10T03:02:11Z",
        "---",
        "",
        "still here",
        "",
      ].join("\n")
    );

    const snap = await snapshot(root, "feature");

    const finding = snap.findings.at(0);
    if (finding === undefined) {
      throw new Error("expected a finding");
    }
    expect(finding.records.map((record) => record.type)).toEqual(["reply"]);
  });

  test("degrades gracefully: a finding dir with an unusable name is skipped", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    const findingsDir = path.join(
      root,
      ".docent",
      "reviews",
      "feature",
      "findings"
    );
    mkdirSync(path.join(findingsDir, "fnd_"), { recursive: true });
    const goodDir = path.join(findingsDir, "fnd_04");
    mkdirSync(goodDir, { recursive: true });
    writeFileSync(
      path.join(goodDir, "001-open.md"),
      [
        "---",
        "schema: docent/finding",
        "changeId: chg_001",
        "createdAt: 2026-07-10T02:14:00Z",
        "---",
        "",
        "still here",
        "",
      ].join("\n")
    );

    const snap = await snapshot(root, "feature");

    expect(snap.findings.map((finding) => finding.id as string)).toEqual([
      "fnd_04",
    ]);
  });

  test("degrades gracefully: a record with the wrong schema is skipped", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    const fndDir = path.join(
      root,
      ".docent",
      "reviews",
      "feature",
      "findings",
      "fnd_03"
    );
    mkdirSync(fndDir, { recursive: true });
    writeFileSync(
      path.join(fndDir, "001-open.md"),
      [
        "---",
        "schema: docent/comment",
        'author: { kind: human, id: angusfretwell@me.com, display: "Angus" }',
        "changeId: chg_001",
        "createdAt: 2026-07-10T02:14:00Z",
        "anchor: { kind: change }",
        "---",
        "",
        "wrong schema tag",
        "",
      ].join("\n")
    );
    writeFileSync(
      path.join(fndDir, "002-reply.md"),
      [
        "---",
        "schema: docent/finding",
        'author: { kind: human, id: angusfretwell@me.com, display: "Angus" }',
        "changeId: chg_001",
        "createdAt: 2026-07-10T03:02:11Z",
        "---",
        "",
        "still here",
        "",
      ].join("\n")
    );

    const snap = await snapshot(root, "feature");

    const finding = snap.findings.at(0);
    if (finding === undefined) {
      throw new Error("expected a finding");
    }
    expect(finding.records.map((record) => record.type)).toEqual(["reply"]);
  });
});

function writeWalkthrough(
  root: string,
  branch: string,
  id: string,
  manifest: string,
  sections: Record<string, string>,
  kind: WalkthroughKind = "code"
) {
  const dir = path.join(
    root,
    ".docent",
    "reviews",
    branch,
    "walkthroughs",
    kind,
    id
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.json"), manifest);
  for (const [name, body] of Object.entries(sections)) {
    writeFileSync(path.join(dir, name), body);
  }
}

function sectionFile(id: string, title: string, ranges: string, body: string) {
  return [
    "---",
    "schema: docent/walkthrough-section",
    `id: ${id}`,
    `title: "${title}"`,
    ranges,
    "---",
    "",
    body,
    "",
  ].join("\n");
}

describe("readReviewSnapshot walkthroughs", () => {
  test("parses the manifest and its sections in array order", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    writeWalkthrough(
      root,
      "feature",
      "wlk_01ABC",
      JSON.stringify({
        bornChangeId: "chg_002",
        id: "wlk_01ABC",
        kind: "code",
        schema: "docent/walkthrough",
        sections: ["s02-dispatch.md", "s01-entry.md"],
        title: "Entry tour",
      }),
      {
        "s01-entry.md": sectionFile(
          "sec_entry",
          "Entry",
          "ranges:\n  - { file: src/index.ts, side: head, blobSha: 9c2a, lines: [10, 24] }",
          "The request enters here {{range:0}}."
        ),
        "s02-dispatch.md": sectionFile(
          "sec_dispatch",
          "Dispatch",
          "ranges:\n  - { file: src/dispatch.ts, side: head, blobSha: a1b2, lines: [1, 8] }",
          "Then it dispatches."
        ),
      }
    );

    const snap = await snapshot(root, "feature");

    const walkthrough = snap.walkthroughs.find(
      (entry) => entry.id === "wlk_01ABC"
    );
    if (walkthrough === undefined) {
      throw new Error("expected the walkthrough");
    }
    expect(walkthrough.kind).toBe("code");
    expect(walkthrough.manifest?.bornChangeId as string).toBe("chg_002");
    // Manifest array order wins over filename order.
    expect(walkthrough.sections.map((s) => s.id as string)).toEqual([
      "sec_dispatch",
      "sec_entry",
    ]);
    expect(walkthrough.sections[0]?.ranges).toMatchObject([
      { blobSha: "a1b2", file: "src/dispatch.ts", lines: [1, 8], side: "head" },
    ]);
    expect(walkthrough.sections[1]?.body).toBe(
      "The request enters here {{range:0}}."
    );
  });

  test("degrades gracefully: a malformed section is dropped, the rest survive", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    writeWalkthrough(
      root,
      "feature",
      "wlk_01DEF",
      JSON.stringify({
        bornChangeId: "chg_001",
        id: "wlk_01DEF",
        kind: "code",
        schema: "docent/walkthrough",
        sections: ["s01-broken.md", "s02-ok.md"],
        title: "Partial",
      }),
      {
        "s01-broken.md": "no frontmatter here\n",
        "s02-ok.md": sectionFile("sec_ok", "OK", "ranges: []", "still here"),
      }
    );

    const snap = await snapshot(root, "feature");

    const walkthrough = snap.walkthroughs.find(
      (entry) => entry.id === "wlk_01DEF"
    );
    expect(walkthrough?.sections.map((s) => s.id as string)).toEqual([
      "sec_ok",
    ]);
  });

  test("parses a product manifest's captures registry and product section frontmatter", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    writeWalkthrough(
      root,
      "feature",
      "wlk_01PROD",
      JSON.stringify({
        bornChangeId: "chg_002",
        captures: [
          {
            dims: [1280, 2400],
            id: "cap_a",
            kind: "screenshot",
            media: "sha-a",
            route: "/signup",
            viewport: [1280, 800],
          },
          {
            durationMs: 8200,
            id: "cap_b",
            kind: "recording",
            media: "sha-b",
            route: "/signup",
            viewport: [1280, 800],
          },
        ],
        id: "wlk_01PROD",
        kind: "product",
        schema: "docent/walkthrough",
        sections: ["s01-upload.md"],
        title: "Signup tour",
      }),
      {
        "s01-upload.md": [
          "---",
          "schema: docent/walkthrough-section",
          "id: sec_upload",
          'title: "Uploading a file"',
          "captures: [cap_a, cap_b]",
          "annotations:",
          "  - anchor: { kind: screenshot-region, capture: cap_a, rect: [0.1, 0.2, 0.3, 0.1] }",
          '    body: "The new upload control."',
          "  - anchor: { kind: recording-timestamp, capture: cap_b, fromMs: 3200, toMs: 5000 }",
          '    body: "Validation fires on blur."',
          "---",
          "",
          "Drag a file onto the dropzone {{capture:0}} and the upload begins {{capture:1}}.",
          "",
        ].join("\n"),
      },
      "product"
    );

    const snap = await snapshot(root, "feature");

    const walkthrough = snap.walkthroughs.find(
      (entry) => entry.id === "wlk_01PROD"
    );
    if (walkthrough === undefined) {
      throw new Error("expected the product walkthrough");
    }
    expect(walkthrough.kind).toBe("product");
    expect(
      walkthrough.manifest?.captures?.map((capture) => capture.id as string)
    ).toEqual(["cap_a", "cap_b"]);
    expect(walkthrough.manifest?.captures?.[0]?.dims).toEqual([1280, 2400]);
    expect(walkthrough.manifest?.captures?.[1]?.durationMs).toBe(8200);
    const [section] = walkthrough.sections;
    expect(section?.captures as readonly string[] | undefined).toEqual([
      "cap_a",
      "cap_b",
    ]);
    expect(section?.annotations?.length).toBe(2);
    expect(section?.annotations?.[0]?.anchor).toMatchObject({
      capture: "cap_a",
      kind: "screenshot-region",
      rect: [0.1, 0.2, 0.3, 0.1],
    });
    expect(section?.annotations?.[1]?.anchor).toMatchObject({
      capture: "cap_b",
      fromMs: 3200,
      kind: "recording-timestamp",
    });
  });

  test("a walkthrough dir with no manifest yields an entry with no sections", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    const dir = path.join(
      root,
      ".docent",
      "reviews",
      "feature",
      "walkthroughs",
      "code",
      "wlk_bare"
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "s01-entry.md"),
      sectionFile("sec_x", "X", "ranges: []", "orphan")
    );

    const snap = await snapshot(root, "feature");

    const walkthrough = snap.walkthroughs.find(
      (entry) => entry.id === "wlk_bare"
    );
    expect(walkthrough).toMatchObject({
      id: "wlk_bare",
      kind: "code",
      sections: [],
    });
    expect(walkthrough?.manifest).toBeUndefined();
  });

  test("degrades gracefully: a walkthrough dir with an unusable name is skipped", async () => {
    const root = scratchDir("docent-review-");
    await snapshot(root, "feature");
    mkdirSync(
      path.join(
        root,
        ".docent",
        "reviews",
        "feature",
        "walkthroughs",
        "code",
        "wlk_bad name"
      ),
      { recursive: true }
    );
    writeWalkthrough(
      root,
      "feature",
      "wlk_01GHI",
      JSON.stringify({
        bornChangeId: "chg_001",
        id: "wlk_01GHI",
        kind: "code",
        schema: "docent/walkthrough",
        sections: [],
        title: "Survivor",
      }),
      {}
    );

    const snap = await snapshot(root, "feature");

    expect(snap.walkthroughs.map((entry) => entry.id as string)).toEqual([
      "wlk_01GHI",
    ]);
  });
});

describe("parseAnchor", () => {
  test("lifts the file from a line-arm anchor", () => {
    const md =
      "---\nanchor: { kind: line, file: src/app.ts, side: head, lines: [1, 2] }\n---\n";

    expect(parseAnchor(md)).toEqual({ anchorFile: "src/app.ts" });
  });

  test("a change-arm anchor has no file", () => {
    expect(parseAnchor("---\nanchor: { kind: change }\n---\n")).toEqual({});
  });

  test("no frontmatter or no anchor yields empty", () => {
    expect(parseAnchor("just a body")).toEqual({});
    expect(parseAnchor("---\nschema: docent/finding\n---\nbody")).toEqual({});
  });

  test("does not leak a file key from beyond the anchor object", () => {
    const md = "---\nanchor: { kind: change }\nother: { file: nope.ts }\n---\n";

    expect(parseAnchor(md)).toEqual({});
  });
});

describe("appendViewedEvent", () => {
  function mark(
    root: string,
    branch: string,
    filePath: string,
    blobSha: string
  ) {
    return runtime.runPromise(
      appendViewedEvent({
        base: "main",
        branch,
        request: ViewedRequest.make({ blobSha, path: filePath }),
        root,
      })
    );
  }

  test("writes a {path, blobSha, ts} event that the snapshot reads back", async () => {
    const root = scratchDir("docent-review-");

    const event = await mark(root, "feature", "src/app.ts", "9c2a1f0");

    expect(event.path).toBe("src/app.ts");
    expect(event.blobSha).toBe("9c2a1f0");
    expect(event.ts).not.toBe("");
    const snap = await snapshot(root, "feature");
    expect(snap.viewed).toEqual([
      { blobSha: "9c2a1f0", path: "src/app.ts", ts: event.ts },
    ]);
  });

  test("is append-only: a re-mark adds a second event (parity toggle)", async () => {
    const root = scratchDir("docent-review-");

    await mark(root, "feature", "src/app.ts", "9c2a1f0");
    await mark(root, "feature", "src/app.ts", "9c2a1f0");

    const snap = await snapshot(root, "feature");
    const forFile = snap.viewed.filter((event) => event.path === "src/app.ts");
    expect(forFile).toHaveLength(2);
  });

  test("auto-creates the Review so the first mark has a home", async () => {
    const root = scratchDir("docent-review-");

    await mark(root, "fresh", "a.ts", "aaa");

    expect(
      existsSync(path.join(root, ".docent", "reviews", "fresh", "review.json"))
    ).toBe(true);
  });
});

describe("setReviewTitle", () => {
  function setTitle(root: string, branch: string, title: string) {
    return runtime.runPromise(
      setReviewTitle({ base: "main", branch, root, title })
    );
  }

  test("names the change under review", async () => {
    const root = scratchDir("docent-review-");

    await setTitle(root, "feature", "Palette panel");

    const snap = await snapshot(root, "feature");
    expect(snap.review.title).toBe("Palette panel");
  });

  test("renaming keeps the Review's id", async () => {
    const root = scratchDir("docent-review-");
    const before = await snapshot(root, "feature");

    await setTitle(root, "feature", "Palette panel");

    const after = await snapshot(root, "feature");
    expect(after.review.id).toBe(before.review.id);
  });
});
