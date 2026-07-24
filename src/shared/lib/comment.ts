import { unique } from "radashi";

import { ANCHOR_KIND } from "../enums/anchor-kind";
import type { CommentStatus } from "../enums/comment-status";
import type { RecordType } from "../enums/record-type";
import type { Anchor, Author, CommentRecord } from "../schemas/comment";
import type { CommentId } from "../schemas/ids";

const RECORD_STATUS: Record<Exclude<RecordType, "edit">, CommentStatus> = {
  action: "actioned",
  open: "open",
  reopen: "open",
  reply: "open",
  resolve: "resolved",
};

export interface Reply {
  author: Author;
  body: string;
  changeId: string;
  createdAt: string;
}

export interface FoldedComment {
  anchor?: Anchor;
  body: string;
  id: CommentId;
  openedAt?: string;
  openedBy?: Author;
  participants: Author[];
  replies: Reply[];
  status: CommentStatus;
}

export function foldComment(
  id: CommentId,
  records: readonly CommentRecord[]
): FoldedComment {
  const ordered = records.toSorted((left, right) =>
    left.name.localeCompare(right.name)
  );

  const edited = new Map<string, string>();
  for (const record of ordered) {
    if (record.type === "edit" && record.edits !== undefined) {
      edited.set(record.edits, record.body);
    }
  }
  function bodyOf(record: CommentRecord) {
    return edited.get(record.name) ?? record.body;
  }

  const root = ordered.find((record) => record.type === "open");

  const replies: Reply[] = [];
  for (const record of ordered) {
    if (record.type === "reply") {
      replies.push({
        author: record.author,
        body: bodyOf(record),
        changeId: record.changeId,
        createdAt: record.createdAt,
      });
    }
  }

  const participants = unique(
    ordered.map((record) => record.author),
    (author) => author.id
  );

  const latest = ordered.findLast((record) => record.type !== "edit");
  const status =
    latest !== undefined && latest.type !== "edit"
      ? RECORD_STATUS[latest.type]
      : "open";

  return {
    anchor: root?.anchor,
    body: root ? bodyOf(root) : "",
    id,
    openedAt: root?.createdAt,
    openedBy: root?.author,
    participants,
    replies,
    status,
  };
}

export function commentJumpTarget(
  anchor: Anchor | undefined
): { file: string; line: number } | undefined {
  if (anchor?.kind === ANCHOR_KIND.line) {
    return { file: anchor.file, line: anchor.lines[0] };
  }
  return undefined;
}

export function commentLocation(anchor: Anchor | undefined): string {
  if (anchor === undefined) {
    return "Detached";
  }
  switch (anchor.kind) {
    case ANCHOR_KIND.line: {
      return `${anchor.file}:${anchor.lines[0]}`;
    }
    case ANCHOR_KIND.file: {
      return anchor.file;
    }
    case ANCHOR_KIND.change: {
      return "Whole change";
    }
    case ANCHOR_KIND.walkthroughSection: {
      return `§ ${anchor.sectionId}`;
    }
    case ANCHOR_KIND.screenshotRegion: {
      return `Screenshot ${anchor.capture}`;
    }
    case ANCHOR_KIND.recordingTimestamp: {
      return `Recording ${anchor.capture}`;
    }
    default: {
      return anchor.quote;
    }
  }
}

function sortKey(anchor: Anchor | undefined): [number, string, number] {
  if (anchor === undefined) {
    return [5, "", 0];
  }
  switch (anchor.kind) {
    case ANCHOR_KIND.line: {
      return [0, anchor.file, anchor.lines[0]];
    }
    case ANCHOR_KIND.file: {
      return [0, anchor.file, 0];
    }
    case ANCHOR_KIND.change: {
      return [1, "", 0];
    }
    case ANCHOR_KIND.walkthroughSection: {
      return [2, `${anchor.walkthroughId}/${anchor.sectionId}`, 0];
    }
    case ANCHOR_KIND.screenshotRegion: {
      return [3, anchor.capture, 0];
    }
    case ANCHOR_KIND.recordingTimestamp: {
      return [3, anchor.capture, anchor.fromMs ?? 0];
    }
    default: {
      return [4, anchor.section, 0];
    }
  }
}

export function sortFoldedComments(
  comments: readonly FoldedComment[]
): FoldedComment[] {
  return comments.toSorted((left, right) => {
    const [leftPillar, leftPath, leftLine] = sortKey(left.anchor);
    const [rightPillar, rightPath, rightLine] = sortKey(right.anchor);

    return (
      leftPillar - rightPillar ||
      leftPath.localeCompare(rightPath) ||
      leftLine - rightLine
    );
  });
}
