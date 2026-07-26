import { describe, expect, test } from "bun:test";

import type { FoldedComment } from "@shared/lib/comment";
import { CommentId, SectionId, WalkthroughId } from "@shared/schemas/ids";

import type { CommentSurface } from "./filters";
import { orderComments } from "./order";

function entry(fields: {
  id: string;
  anchor?: FoldedComment["anchor"];
  openedAt?: string;
  surface?: CommentSurface;
}) {
  return {
    comment: {
      anchor: fields.anchor,
      body: "",
      id: CommentId.make(fields.id),
      openedAt: fields.openedAt,
      participants: [],
      replies: [],
      status: "open",
    } as FoldedComment,
    surface: fields.surface,
  };
}

function ids(entries: readonly { comment: FoldedComment }[]): string[] {
  return entries.map(({ comment }) => comment.id);
}

const sectionAnchor = {
  kind: "walkthrough-section",
  sectionId: SectionId.make("sec_1"),
  walkthroughId: WalkthroughId.make("wlk_1"),
} as const;

describe("orderComments", () => {
  test("leads with whole-change comments, then the current surface", () => {
    const ordered = orderComments(
      [
        entry({
          id: "cmt_other",
          openedAt: "2026-07-10T04:00:00Z",
          surface: "code",
        }),
        entry({
          anchor: sectionAnchor,
          id: "cmt_current",
          openedAt: "2026-07-10T03:00:00Z",
          surface: "product",
        }),
        entry({
          anchor: { kind: "change" },
          id: "cmt_change",
          openedAt: "2026-07-10T02:00:00Z",
          surface: "diff",
        }),
      ],
      "product"
    );

    expect(ids(ordered)).toEqual(["cmt_change", "cmt_current", "cmt_other"]);
  });

  test("orders newest first within a group", () => {
    const ordered = orderComments(
      [
        entry({
          id: "cmt_old",
          openedAt: "2026-07-10T01:00:00Z",
          surface: "diff",
        }),
        entry({
          id: "cmt_new",
          openedAt: "2026-07-11T09:30:00Z",
          surface: "diff",
        }),
        entry({
          id: "cmt_mid",
          openedAt: "2026-07-10T22:00:00Z",
          surface: "diff",
        }),
      ],
      "diff"
    );

    expect(ids(ordered)).toEqual(["cmt_new", "cmt_mid", "cmt_old"]);
  });

  test("keeps whole-change comments first when no surface is current", () => {
    const ordered = orderComments([
      entry({
        id: "cmt_section",
        openedAt: "2026-07-10T05:00:00Z",
        surface: "code",
      }),
      entry({
        anchor: { kind: "change" },
        id: "cmt_change",
        openedAt: "2026-07-10T01:00:00Z",
        surface: "diff",
      }),
    ]);

    expect(ids(ordered)).toEqual(["cmt_change", "cmt_section"]);
  });
});
