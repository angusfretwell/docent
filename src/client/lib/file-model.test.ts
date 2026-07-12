import { describe, expect, test } from "bun:test";

import type { FindingEntry, ViewedEvent } from "@shared/schemas/review";

import {
  buildFileModel,
  buildRowStates,
  countViewed,
  visibleFiles,
} from "./file-model";

/** A patch touching one file, with the given hunk of +adds/-dels. */
function filePatch(header: string, body: string, index: string): string {
  return `diff --git ${header}\n${index}\n${body}`;
}

const APP = filePatch(
  "a/src/app.ts b/src/app.ts",
  `--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 a
+b
 c
`,
  "index aaa0000..1111111 100644"
);

const OTHER = filePatch(
  "a/src/other.ts b/src/other.ts",
  `--- a/src/other.ts
+++ b/src/other.ts
@@ -1,2 +1,3 @@
 a
+b
 c
`,
  "index bbb0000..2222222 100644"
);

const LOCK = filePatch(
  "a/package-lock.json b/package-lock.json",
  `--- a/package-lock.json
+++ b/package-lock.json
@@ -1,2 +1,3 @@
 a
+b
 c
`,
  "index ccc0000..3333333 100644"
);

function finding(anchorFile?: string): FindingEntry {
  return { anchorFile, id: "fnd_1", records: [] } as unknown as FindingEntry;
}

function viewedEvent(path: string, blobSha: string): ViewedEvent {
  return { blobSha, path, ts: "2026-07-10T00:00:00Z" } as ViewedEvent;
}

describe("buildFileModel", () => {
  test("orders entries by path when no explicit fileOrder is given", () => {
    const model = buildFileModel({
      findings: [],
      generated: [],
      order: "path",
      patch: OTHER + APP,
      viewedEvents: [],
    });

    expect(model.allEntries.map((entry) => entry.path)).toEqual([
      "src/app.ts",
      "src/other.ts",
    ]);
    expect(model.explicitOrder).toBe(false);
  });

  test("an explicit fileOrder wins over the path/size sort", () => {
    const model = buildFileModel({
      fileOrder: ["src/other.ts", "src/app.ts"],
      findings: [],
      generated: [],
      order: "path",
      patch: APP + OTHER,
      viewedEvents: [],
    });

    expect(model.allEntries.map((entry) => entry.path)).toEqual([
      "src/other.ts",
      "src/app.ts",
    ]);
    expect(model.explicitOrder).toBe(true);
  });

  test("classifies a lockfile as generated and auto-marks it viewed", () => {
    const model = buildFileModel({
      findings: [],
      generated: [],
      order: "path",
      patch: LOCK,
      viewedEvents: [],
    });
    const [entry] = model.allEntries;

    expect(model.classFor(entry?.id ?? "").generated).toBe(true);
    expect(model.viewedModel.viewed).toBe(1);
  });

  test("classFor falls back to the no-edge-case default for an unknown id", () => {
    const model = buildFileModel({
      findings: [],
      generated: [],
      order: "path",
      patch: APP,
      viewedEvents: [],
    });

    expect(model.classFor("nonexistent#9")).toMatchObject({
      binary: false,
      generated: false,
      large: false,
    });
  });

  test("collects anchored finding files, skipping findings without one", () => {
    const model = buildFileModel({
      findings: [finding("src/app.ts"), finding()],
      generated: [],
      order: "path",
      patch: APP,
      viewedEvents: [],
    });

    expect(model.findingPaths).toEqual(new Set(["src/app.ts"]));
  });

  test("folds viewed events against the ordered entries", () => {
    const model = buildFileModel({
      findings: [],
      generated: [],
      order: "path",
      patch: APP,
      viewedEvents: [viewedEvent("src/app.ts", "1111111")],
    });

    expect(model.viewedModel.viewed).toBe(1);
  });
});

describe("visibleFiles", () => {
  function model() {
    return buildFileModel({
      findings: [finding("src/app.ts")],
      generated: [],
      order: "path",
      patch: APP + OTHER,
      viewedEvents: [],
    });
  }

  test("the substring filter narrows both the tree and the flattened entries", () => {
    const { entries } = visibleFiles(
      model(),
      { filter: "app", findingsOnly: false, unviewedOnly: false },
      () => false
    );

    expect(entries.map((entry) => entry.path)).toEqual(["src/app.ts"]);
  });

  test("unviewedOnly drops files the caller reports as viewed", () => {
    const { entries } = visibleFiles(
      model(),
      { filter: "", findingsOnly: false, unviewedOnly: true },
      (id) => id.startsWith("src/app.ts")
    );

    expect(entries.map((entry) => entry.path)).toEqual(["src/other.ts"]);
  });

  test("findingsOnly keeps only files with an anchored finding", () => {
    const { entries } = visibleFiles(
      model(),
      { filter: "", findingsOnly: true, unviewedOnly: false },
      () => false
    );

    expect(entries.map((entry) => entry.path)).toEqual(["src/app.ts"]);
  });
});

describe("buildRowStates", () => {
  test("flags changed-since-viewed only while the file is currently unviewed", () => {
    const model = buildFileModel({
      findings: [],
      generated: [],
      order: "path",
      patch: APP,
      viewedEvents: [viewedEvent("src/app.ts", "old-blob")],
    });
    const [entry] = model.allEntries;

    const rows = buildRowStates(
      model.allEntries,
      model.viewedModel,
      () => false,
      model.classFor
    );

    expect(rows.get(entry?.id ?? "")).toMatchObject({
      changed: true,
      viewed: false,
    });
  });

  test("carries the generated flag through from classFor", () => {
    const model = buildFileModel({
      findings: [],
      generated: [],
      order: "path",
      patch: LOCK,
      viewedEvents: [],
    });
    const [entry] = model.allEntries;

    const rows = buildRowStates(
      model.allEntries,
      model.viewedModel,
      () => true,
      model.classFor
    );

    expect(rows.get(entry?.id ?? "")).toMatchObject({ generated: true });
  });
});

describe("countViewed", () => {
  test("counts the entries the isViewed predicate reports as viewed", () => {
    const model = buildFileModel({
      findings: [],
      generated: [],
      order: "path",
      patch: APP + OTHER,
      viewedEvents: [],
    });
    const [firstEntry] = model.allEntries;
    const firstId = firstEntry?.id ?? "";

    expect(countViewed(model.allEntries, (id) => id === firstId)).toBe(1);
  });
});
