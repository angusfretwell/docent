import type { ChangeVerb } from "../enums/change-verb";
import type { DriftState } from "../enums/drift-state";
import type { Anchor, CommentRecord } from "../schemas/comment";

export interface Reanchor {
  /** Born range for live/outdated; the moved range for shifted. */
  lines: [number, number];
  state: DriftState;
}

export interface AnchorContext {
  /** Absent ⇒ file unchanged base..head. */
  currentSideSha?: string;
  deleted?: boolean;
  renamed?: boolean;
}

export type DriftPlan =
  | { kind: "resolved"; state: DriftState }
  | {
      bornSha: string;
      currentSha: string;
      kind: "reanchor";
      range: [number, number];
    };

export interface DriftBadge {
  label: string;
  tone: "signal" | "muted";
}

export interface ChangeEvent {
  changeId: string;
  verb: ChangeVerb;
}

/** Drops the single trailing newline so line count matches 1-based anchor line numbers. */
export function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

export function reanchorRange(
  born: readonly string[],
  current: readonly string[],
  range: readonly [number, number]
): Reanchor {
  const [start, end] = range;
  if (start < 1 || end < start || end > born.length) {
    return { lines: [start, end], state: "outdated" };
  }

  const block = born.slice(start - 1, end);
  const matches: number[] = [];
  for (let i = 0; i + block.length <= current.length; i += 1) {
    let hit = true;
    for (let j = 0; j < block.length; j += 1) {
      if (current[i + j] !== block[j]) {
        hit = false;
        break;
      }
    }
    if (hit) {
      matches.push(i);
    }
  }

  if (matches.length === 0) {
    return { lines: [start, end], state: "outdated" };
  }

  const bornIndex = start - 1;
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const index of matches) {
    const distance = Math.abs(index - bornIndex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  const newStart = best + 1;
  if (newStart === start) {
    return { lines: [start, end], state: "live" };
  }
  return { lines: [newStart, newStart + block.length - 1], state: "shifted" };
}

/** Clamped so a stale range never throws. */
export function excerptLines(
  text: string,
  range: readonly [number, number]
): string {
  const lines = splitLines(text);
  const [start, end] = range;
  return lines.slice(Math.max(0, start - 1), Math.max(0, end)).join("\n");
}

/** Content-addressed anchors only; identity arms are classified upstream by identityAnchorDrift and never reach here. */
export function planDrift(anchor: Anchor, ctx: AnchorContext): DriftPlan {
  if (anchor.kind === "file") {
    const state: DriftState = ctx.deleted || ctx.renamed ? "outdated" : "live";
    return { kind: "resolved", state };
  }
  if (anchor.kind === "line") {
    if (
      ctx.currentSideSha === undefined ||
      ctx.currentSideSha === anchor.blobSha
    ) {
      return { kind: "resolved", state: "live" };
    }
    return {
      bornSha: anchor.blobSha,
      currentSha: ctx.currentSideSha,
      kind: "reanchor",
      range: [anchor.lines[0], anchor.lines[1]],
    };
  }

  return { kind: "resolved", state: "live" };
}

export function driftBadge(
  state: DriftState,
  resolved: boolean
): DriftBadge | undefined {
  if (state === "outdated") {
    return { label: "Outdated", tone: resolved ? "muted" : "signal" };
  }
  return undefined;
}

const RECORD_VERB: Partial<Record<CommentRecord["type"], ChangeVerb>> = {
  open: "opened",
  reopen: "reopened",
  reply: "replied",
  resolve: "resolved",
};

export function changeHistory(
  records: readonly CommentRecord[]
): ChangeEvent[] {
  const ordered = records.toSorted((left, right) =>
    left.name.localeCompare(right.name)
  );
  const events: ChangeEvent[] = [];
  for (const record of ordered) {
    const verb = RECORD_VERB[record.type];
    if (verb !== undefined && events.at(-1)?.verb !== verb) {
      events.push({ changeId: record.changeId, verb });
    }
  }
  return events;
}

export function changeHistoryLabel(records: readonly CommentRecord[]): string {
  return changeHistory(records)
    .map((event) => `${event.verb} on ${event.changeId}`)
    .join(" · ");
}
