/**
 * The read-time fold that turns a Finding's append-only record directory into
 * the shape the Findings panel renders (data-model.md §5 & §7). Runtime-neutral:
 * no Bun or DOM globals, so the server (which parses record files off disk) and
 * the client (which folds and renders) share one definition. The record schema
 * itself lives in `schemas/finding.ts`.
 *
 * A Finding is never a single file: it is a directory of records, one per
 * mutation, folded here. State — resolved, what's-next, the current body of an
 * edited record — is derived, never persisted (data-model.md §5.1).
 */

import { unique } from "radashi";

import { ANCHOR_KIND } from "../schemas/finding";
import type {
  Anchor,
  Author,
  Disposition,
  FindingRecord,
} from "../schemas/finding";

/** The actor-blind queue read derived from a Finding's records (data-model.md §7). */
export type WhatsNext =
  | "needs-action"
  | "needs-verify"
  | "needs-answer"
  | "needs-decision"
  | "closed";

/** Human labels for each what's-next state — one source for every surface. */
export const WHATS_NEXT_LABEL: Record<WhatsNext, string> = {
  closed: "Closed",
  "needs-action": "Needs action",
  "needs-answer": "Needs answer",
  "needs-decision": "Needs decision",
  "needs-verify": "Needs verify",
};

export interface Reply {
  author: Author;
  body: string;
  changeId: string;
  createdAt: string;
  disposition?: Disposition;
}

/** A Finding folded from its records — the shape the Findings panel renders. */
export interface FoldedFinding {
  anchor?: Anchor;
  body: string;
  id: string;
  participants: Author[];
  replies: Reply[];
  resolved: boolean;
  whatsNext: WhatsNext;
}

/** Map a reply's disposition onto its what's-next (data-model.md §7). */
function dispositionNext(disposition: Disposition | undefined): WhatsNext {
  if (disposition === "actioned") {
    return "needs-verify";
  }
  if (disposition === "question") {
    return "needs-answer";
  }
  if (disposition === "declined") {
    return "needs-decision";
  }
  return "needs-action";
}

/**
 * Fold a Finding's records into its rendered shape. State is derived here, not
 * stored: `resolved` folds from the latest resolve/reopen, `whatsNext` from the
 * latest content record's disposition (blind to who authored it), and each
 * record's body is superseded by the latest edit that names it.
 */
export function foldFinding(
  id: string,
  records: readonly FindingRecord[]
): FoldedFinding {
  const ordered = records.toSorted((left, right) =>
    left.name.localeCompare(right.name)
  );

  // Latest edit wins per target record; a record's effective body is that edit's
  // body, or its own when unedited.
  const edited = new Map<string, string>();
  for (const record of ordered) {
    if (record.type === "edit" && record.edits !== undefined) {
      edited.set(record.edits, record.body);
    }
  }
  function bodyOf(record: FindingRecord) {
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
        disposition: record.disposition,
      });
    }
  }

  // Open/resolved folds from resolve/reopen — and re-commenting reopens: a reply
  // appended after a resolve returns the Finding to open (data-model.md §7).
  let resolved = false;
  for (const record of ordered) {
    if (record.type === "resolve") {
      resolved = true;
    } else if (record.type === "reopen" || record.type === "reply") {
      resolved = false;
    }
  }

  const participants = unique(
    ordered.map((record) => record.author),
    (author) => author.id
  );

  const latest = ordered.findLast((record) => record.type !== "edit");
  let whatsNext: WhatsNext = "needs-action";
  if (resolved) {
    whatsNext = "closed";
  } else if (latest?.type === "reply") {
    whatsNext = dispositionNext(latest.disposition);
  }

  return {
    anchor: root?.anchor,
    body: root ? bodyOf(root) : "",
    id,
    participants,
    replies,
    resolved,
    whatsNext,
  };
}

/**
 * The file and line a Finding jumps to in the diff, or nothing when it has no
 * line anchor. Kept beside the other anchor readers so anchor internals live in
 * one module (the panel drives this through `DiffViewHandle.scrollToLine`).
 */
export function findingJumpTarget(
  anchor: Anchor | undefined
): { file: string; line: number } | undefined {
  if (anchor?.kind === ANCHOR_KIND.line) {
    return { file: anchor.file, line: anchor.lines[0] };
  }
  return undefined;
}

/** A one-line human location for a Finding's anchor (diff-review.md §7). */
export function findingLocation(anchor: Anchor | undefined): string {
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

// A sort key placing code findings first (by file, then line), then whole-change,
// walkthrough, capture, text, and finally detached — natural reading order across
// pillars (diff-review.md §7).
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

/** Order folded Findings by location — the panel's flat reading order. */
export function sortFoldedFindings(
  findings: readonly FoldedFinding[]
): FoldedFinding[] {
  return findings.toSorted((left, right) => {
    const [leftPillar, leftPath, leftLine] = sortKey(left.anchor);
    const [rightPillar, rightPath, rightLine] = sortKey(right.anchor);

    return (
      leftPillar - rightPillar ||
      leftPath.localeCompare(rightPath) ||
      leftLine - rightLine
    );
  });
}
