/**
 * The Finding record schema (`docent/finding@3`) and the read-time fold that
 * turns a Finding's append-only record directory into the shape the Findings
 * panel renders. Runtime-neutral: no Bun or DOM globals, so the server (which
 * parses record files off disk) and the client (which folds and renders) share
 * one definition (data-model.md §5 & §7).
 *
 * A Finding is never a single file: it is a directory of records, one per
 * mutation, folded here. State — resolved, what's-next, the current body of an
 * edited record — is derived, never persisted (data-model.md §5.1).
 */

import { Schema } from "effect";
import { unique } from "radashi";

/** Attribution carried by every record (data-model.md §5.4). */
export class Author extends Schema.Class<Author>("Author")({
  display: Schema.String,
  /** Stable machine handle — git email or agent slug. */
  id: Schema.String,
  /** The load-bearing axis: human vs. agent. */
  kind: Schema.Literals(["human", "agent"]),
  /** Optional agent metadata. */
  model: Schema.optional(Schema.String),
}) {}

// The anchor union (data-model.md §5.3): seven arms across the three pillars,
// discriminated by `kind`. Carried on the root (open) record only. The kind
// values are named once here so the schema and every fold read the same token.
const ANCHOR_KIND = {
  change: "change",
  file: "file",
  line: "line",
  recordingTimestamp: "recording-timestamp",
  screenshotRegion: "screenshot-region",
  textSpan: "text-span",
  walkthroughSection: "walkthrough-section",
} as const;

const Side = Schema.Literals(["base", "head"]);
const ChangeAnchor = Schema.Struct({ kind: Schema.Literal(ANCHOR_KIND.change) });
const FileAnchor = Schema.Struct({
  blobSha: Schema.String,
  file: Schema.String,
  kind: Schema.Literal(ANCHOR_KIND.file),
  side: Side,
});
const LineAnchor = Schema.Struct({
  blobSha: Schema.String,
  file: Schema.String,
  kind: Schema.Literal(ANCHOR_KIND.line),
  lines: Schema.Tuple([Schema.Number, Schema.Number]),
  side: Side,
});
const WalkthroughSectionAnchor = Schema.Struct({
  kind: Schema.Literal(ANCHOR_KIND.walkthroughSection),
  sectionId: Schema.String,
  walkthroughId: Schema.String,
});
const ScreenshotRegionAnchor = Schema.Struct({
  capture: Schema.String,
  kind: Schema.Literal(ANCHOR_KIND.screenshotRegion),
  rect: Schema.optional(Schema.Tuple([Schema.Number, Schema.Number, Schema.Number, Schema.Number])),
});
const RecordingTimestampAnchor = Schema.Struct({
  capture: Schema.String,
  fromMs: Schema.optional(Schema.Number),
  kind: Schema.Literal(ANCHOR_KIND.recordingTimestamp),
  toMs: Schema.optional(Schema.Number),
});
const TextSpanAnchor = Schema.Struct({
  kind: Schema.Literal(ANCHOR_KIND.textSpan),
  prefix: Schema.optional(Schema.String),
  quote: Schema.String,
  section: Schema.String,
  suffix: Schema.optional(Schema.String),
});

export const Anchor = Schema.Union([
  ChangeAnchor,
  FileAnchor,
  LineAnchor,
  WalkthroughSectionAnchor,
  ScreenshotRegionAnchor,
  RecordingTimestampAnchor,
  TextSpanAnchor,
]);
export type Anchor = typeof Anchor.Type;

/** How a fixer ended its turn (data-model.md §7); optional on reply records. */
export const Disposition = Schema.Literals(["actioned", "declined", "question"]);
export type Disposition = typeof Disposition.Type;

/** The record types, derived from the `NNN-<type>.md` filename (data-model.md §5.1). */
export const RECORD_TYPES = ["open", "reply", "resolve", "reopen", "edit"] as const;
export const RecordType = Schema.Literals(RECORD_TYPES);
export type RecordType = typeof RecordType.Type;

/**
 * One parsed record: the `NNN-<type>.md` filename plus its frontmatter envelope
 * and markdown body. `anchor` rides the root (open) record; `disposition` an
 * optional reply field; `edits` names the record an edit supersedes (its
 * filename) — the append-only equivalent of an in-place body edit.
 */
export class FindingRecord extends Schema.Class<FindingRecord>("FindingRecord")({
  anchor: Schema.optional(Anchor),
  author: Author,
  body: Schema.String,
  changeId: Schema.String,
  createdAt: Schema.String,
  disposition: Schema.optional(Disposition),
  edits: Schema.optional(Schema.String),
  /** The record's filename, e.g. `002-reply.md` — orders the log and is the edit target. */
  name: Schema.String,
  /** The envelope discriminant; a record without it fails to decode and is skipped. */
  schema: Schema.Literal("docent/finding@3"),
  type: RecordType,
}) {}

/** The actor-blind queue read derived from a Finding's records (data-model.md §7). */
export type WhatsNext =
  | "needs-action"
  | "needs-verify"
  | "needs-answer"
  | "needs-decision"
  | "closed";

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
export function foldFinding(id: string, records: readonly FindingRecord[]): FoldedFinding {
  const ordered = records.toSorted((left, right) => left.name.localeCompare(right.name));

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
    (author) => author.id,
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
export function sortFoldedFindings(findings: readonly FoldedFinding[]): FoldedFinding[] {
  return findings.toSorted((left, right) => {
    const [leftPillar, leftPath, leftLine] = sortKey(left.anchor);
    const [rightPillar, rightPath, rightLine] = sortKey(right.anchor);

    return leftPillar - rightPillar || leftPath.localeCompare(rightPath) || leftLine - rightLine;
  });
}
