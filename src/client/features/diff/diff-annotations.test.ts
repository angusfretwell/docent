import { describe, expect, test } from "bun:test";

import type { DriftResult } from "@client/lib/drift";
import type { FileEntry } from "@client/lib/nav";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { FoldedFinding } from "@shared/lib/finding";
import type { Anchor } from "@shared/schemas/finding";

import { buildDiffItems } from "./diff-annotations";

const HEAD_BLOB = "9c2a1f0";
const BASE_BLOB = "a1b2c3d";

function entry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    additions: 1,
    blobSha: HEAD_BLOB,
    changeType: "M",
    deletions: 0,
    hunkStarts: [1],
    hunks: 1,
    id: "src/a.ts#0",
    path: "src/a.ts",
    ...overrides,
  };
}

function finding(id: string, anchor: Anchor): FoldedFinding {
  return {
    anchor,
    body: "",
    id,
    participants: [],
    replies: [],
    resolved: false,
    whatsNext: "needs-action",
  };
}

// The diff's blobs on each side gate whether a line anchor is still live.
function fileDiffFor(): FileDiffMetadata {
  return {
    newObjectId: HEAD_BLOB,
    prevObjectId: BASE_BLOB,
  } as FileDiffMetadata;
}

function itemsFor(findings: readonly FoldedFinding[], entries = [entry()]) {
  return buildDiffItems({
    composing: null,
    entries,
    fileDiffFor,
    findings,
    isEdgeCollapsed: () => false,
    isExpanded: () => false,
    isViewed: () => false,
  });
}

function itemsWithDrift(
  findings: readonly FoldedFinding[],
  drift: ReadonlyMap<string, DriftResult>
) {
  return buildDiffItems({
    composing: null,
    driftFor: (id) => drift.get(id),
    entries: [entry()],
    fileDiffFor,
    findings,
    isEdgeCollapsed: () => false,
    isExpanded: () => false,
    isViewed: () => false,
  });
}

const lineFinding = finding("fnd", {
  blobSha: "BORN",
  file: "src/a.ts",
  kind: "line",
  lines: [4, 6],
  side: "head",
});

describe("buildDiffItems inline annotations", () => {
  test("renders a live head line anchor whose born blob still matches the head", () => {
    const items = itemsFor([
      finding("fnd_live", {
        blobSha: HEAD_BLOB,
        file: "src/a.ts",
        kind: "line",
        lines: [4, 6],
        side: "head",
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.annotations).toMatchObject([
      { lineNumber: 4, side: "additions" },
    ]);
  });

  test("drops a drifted head line anchor whose born blob no longer matches (never mis-pins)", () => {
    const items = itemsFor([
      finding("fnd_stale", {
        blobSha: "OUTDATED",
        file: "src/a.ts",
        kind: "line",
        lines: [4, 6],
        side: "head",
      }),
    ]);

    expect(items[0]?.annotations).toEqual([]);
  });

  test("renders a live base-side line anchor whose born blob matches the base", () => {
    const items = itemsFor([
      finding("fnd_base", {
        blobSha: BASE_BLOB,
        file: "src/a.ts",
        kind: "line",
        lines: [2, 2],
        side: "base",
      }),
    ]);

    expect(items[0]?.annotations).toMatchObject([
      { lineNumber: 2, side: "deletions" },
    ]);
  });

  test("drops a drifted base-side line anchor (gates its own side, not just head)", () => {
    const items = itemsFor([
      finding("fnd_base_stale", {
        blobSha: "OLD_BASE",
        file: "src/a.ts",
        kind: "line",
        lines: [2, 2],
        side: "base",
      }),
    ]);

    expect(items[0]?.annotations).toEqual([]);
  });

  test("keeps a file anchor inline even when the head blob changed (§6.1: file-kind drifts only on delete/rename)", () => {
    const items = itemsFor([
      finding("fnd_file", {
        blobSha: "SOME_OLDER_BLOB",
        file: "src/a.ts",
        kind: "file",
        side: "head",
      }),
      finding("fnd_change", { kind: "change" }),
    ]);

    expect(items[0]?.annotations).toMatchObject([
      { lineNumber: 0, side: "additions" },
    ]);
  });
});

describe("buildDiffItems with a drift read", () => {
  test("a live finding renders at its born line, un-badged", () => {
    const drift = new Map([
      ["fnd", { lines: [4, 6] as [number, number], state: "live" as const }],
    ]);
    const items = itemsWithDrift([lineFinding], drift);

    expect(items[0]?.annotations).toMatchObject([
      { lineNumber: 4, side: "additions" },
    ]);
    expect(items[0]?.annotations?.[0]?.metadata).toMatchObject({
      drift: "live",
    });
  });

  test("a shifted finding re-anchors to its moved line with a shifted badge", () => {
    const drift = new Map([
      [
        "fnd",
        { lines: [9, 11] as [number, number], state: "shifted" as const },
      ],
    ]);
    const items = itemsWithDrift([lineFinding], drift);

    expect(items[0]?.annotations).toMatchObject([
      { lineNumber: 9, side: "additions" },
    ]);
    expect(items[0]?.annotations?.[0]?.metadata).toMatchObject({
      drift: "shifted",
    });
  });

  test("an outdated finding detaches from the diff (panel only)", () => {
    const drift = new Map([
      [
        "fnd",
        { lines: [4, 6] as [number, number], state: "outdated" as const },
      ],
    ]);

    expect(itemsWithDrift([lineFinding], drift)[0]?.annotations).toEqual([]);
  });

  test("a finding whose re-anchor is still pending is held back (never mis-pinned)", () => {
    expect(itemsWithDrift([lineFinding], new Map())[0]?.annotations).toEqual(
      []
    );
  });
});
