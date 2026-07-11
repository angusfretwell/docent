import { describe, expect, test } from "bun:test";
import type { ViewedEvent } from "@shared/schemas/review";
import type { FileEntry } from "./nav";
import { computeViewed, viewedStateFor } from "./viewed";

function entry(path: string, blobSha: string): FileEntry {
  return {
    additions: 0,
    blobSha,
    changeType: "M",
    deletions: 0,
    hunkStarts: [],
    hunks: 0,
    id: `${path}#0`,
    path,
  };
}

function event(path: string, blobSha: string, ts = "2026-07-10T00:00:00Z"): ViewedEvent {
  return { blobSha, path, ts } as ViewedEvent;
}

describe("computeViewed", () => {
  test("no events: every file unviewed, progress 0 / total", () => {
    const model = computeViewed([], [entry("a.ts", "aaa"), entry("b.ts", "bbb")]);

    expect(model.viewed).toBe(0);
    expect(model.total).toBe(2);
    expect(viewedStateFor(model, "a.ts#0")).toEqual({ changedSinceViewed: false, viewed: false });
  });

  test("one event marks the matching head blob viewed (odd parity)", () => {
    const model = computeViewed([event("a.ts", "aaa")], [entry("a.ts", "aaa")]);

    expect(viewedStateFor(model, "a.ts#0").viewed).toBe(true);
    expect(model.viewed).toBe(1);
  });

  test("byte-identical head blob across a recompute keeps viewed", () => {
    const events = [event("a.ts", "aaa")];
    // Same blobSha in a later Change (byte-identical or pure rebase) still matches.
    const model = computeViewed(events, [entry("a.ts", "aaa")]);

    expect(viewedStateFor(model, "a.ts#0").viewed).toBe(true);
  });

  test("changed head blob clears viewed and flags changed-since-viewed", () => {
    // Viewed at blob aaa, but the file's head is now bbb.
    const model = computeViewed([event("a.ts", "aaa")], [entry("a.ts", "bbb")]);

    expect(viewedStateFor(model, "a.ts#0")).toEqual({
      changedSinceViewed: true,
      viewed: false,
    });
    expect(model.viewed).toBe(0);
  });

  test("a second event on the same blob toggles back to unviewed (even parity)", () => {
    const model = computeViewed(
      [event("a.ts", "aaa"), event("a.ts", "aaa", "2026-07-10T01:00:00Z")],
      [entry("a.ts", "aaa")],
    );

    expect(viewedStateFor(model, "a.ts#0").viewed).toBe(false);
    // Never viewed at the current blob and no other blob was viewed → not "changed".
    expect(viewedStateFor(model, "a.ts#0").changedSinceViewed).toBe(false);
  });

  test("re-mark after a toggle-off is viewed again (odd parity)", () => {
    const model = computeViewed(
      [
        event("a.ts", "aaa"),
        event("a.ts", "aaa", "2026-07-10T01:00:00Z"),
        event("a.ts", "aaa", "2026-07-10T02:00:00Z"),
      ],
      [entry("a.ts", "aaa")],
    );

    expect(viewedStateFor(model, "a.ts#0").viewed).toBe(true);
  });

  test("a deletion (null-SHA head) is viewable like any other file", () => {
    const nullSha = "0000000000000000000000000000000000000000";
    const model = computeViewed([event("gone.ts", nullSha)], [entry("gone.ts", nullSha)]);

    expect(viewedStateFor(model, "gone.ts#0").viewed).toBe(true);
    expect(model.viewed).toBe(1);
  });

  test("a content-less file (empty key) is still toggleable, so progress can reach 100%", () => {
    // A mode-only change carries no blob id; it must still count toward progress.
    const model = computeViewed([event("mode.ts", "")], [entry("mode.ts", "")]);

    expect(viewedStateFor(model, "mode.ts#0").viewed).toBe(true);
    expect(model.viewed).toBe(1);
  });

  test("events for other files do not leak across paths", () => {
    const model = computeViewed(
      [event("a.ts", "aaa")],
      [entry("a.ts", "aaa"), entry("b.ts", "aaa")],
    );

    expect(viewedStateFor(model, "a.ts#0").viewed).toBe(true);
    expect(viewedStateFor(model, "b.ts#0").viewed).toBe(false);
  });

  test("progress counts viewed files over total", () => {
    const model = computeViewed(
      [event("a.ts", "aaa"), event("c.ts", "ccc")],
      [entry("a.ts", "aaa"), entry("b.ts", "bbb"), entry("c.ts", "ccc")],
    );

    expect(model.viewed).toBe(2);
    expect(model.total).toBe(3);
  });
});

function isAuto(e: FileEntry): boolean {
  return e.path.startsWith("gen/");
}

describe("computeViewed — auto-viewed files (generated, pure renames)", () => {
  test("an auto-viewed file with no events defaults to viewed and counts", () => {
    const model = computeViewed([], [entry("gen/lock", "aaa"), entry("src/a", "bbb")], isAuto);

    expect(viewedStateFor(model, "gen/lock#0")).toEqual({
      changedSinceViewed: false,
      viewed: true,
    });
    expect(viewedStateFor(model, "src/a#0").viewed).toBe(false);
    expect(model.viewed).toBe(1);
  });

  test("one event un-views an auto-viewed file (parity baseline flipped)", () => {
    // The reviewer un-checked the auto-viewed file; a single appended event
    // persists the un-view instead of re-asserting viewed.
    const model = computeViewed([event("gen/lock", "aaa")], [entry("gen/lock", "aaa")], isAuto);

    expect(viewedStateFor(model, "gen/lock#0").viewed).toBe(false);
    expect(model.viewed).toBe(0);
  });

  test("two events on an auto-viewed file return it to viewed", () => {
    const model = computeViewed(
      [event("gen/lock", "aaa"), event("gen/lock", "aaa", "2026-07-10T01:00:00Z")],
      [entry("gen/lock", "aaa")],
      isAuto,
    );

    expect(viewedStateFor(model, "gen/lock#0").viewed).toBe(true);
  });

  test("an auto-viewed file whose head blob changed re-applies the default", () => {
    // Auto-view re-applies at the new blob, so no changed-since-viewed flag.
    const model = computeViewed([event("gen/lock", "aaa")], [entry("gen/lock", "ccc")], isAuto);

    expect(viewedStateFor(model, "gen/lock#0")).toEqual({
      changedSinceViewed: false,
      viewed: true,
    });
  });
});
