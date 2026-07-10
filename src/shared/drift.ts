/**
 * Drift — a Finding anchor's standing against the newest Change, computed lazily
 * at render time from the immutable born anchor, never persisted and never
 * auto-toggling resolution (data-model.md §6). Runtime-neutral: no Bun or DOM
 * globals, so the client folds and renders drift with the same code the tests
 * exercise.
 *
 * The heart is `reanchorRange`: a blob-to-blob re-anchor on the anchor's own
 * side. `planDrift` layers the §6.1 fast paths on top (change never drifts,
 * file drifts only on delete/rename, a still-matching born blob is live without
 * computing) and decides when the blob text must actually be fetched and
 * diffed. `driftBadge` maps the (drift × resolved) matrix (§6.3) to a badge, and
 * `changeHistory` folds the per-record `changeId` into the panel's cross-Change
 * timeline labels (diff-review.md §7).
 */

import type { Anchor, FindingRecord } from "./finding.ts";

/** A content-addressed anchor's standing against the newest Change (§6.1). */
export type DriftState = "live" | "shifted" | "outdated";

/** A re-anchored line range plus the state that placed it there. */
export interface Reanchor {
  /** Born range for live/outdated; the moved range for shifted. */
  lines: [number, number];
  state: DriftState;
}

/**
 * Split blob text into content lines, dropping the single trailing newline so a
 * file's line count matches its 1-based anchor line numbers.
 */
export function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

/**
 * Re-anchor a born line range onto the newest blob by locating the anchored
 * block verbatim (data-model.md §6.1):
 *
 * - present at the same line numbers → **live**;
 * - present but moved → **shifted** (to the occurrence nearest its born
 *   position, stable when the block repeats);
 * - absent — the anchored bytes were edited or deleted, or new lines were
 *   inserted into the range so it is no longer byte-identical → **outdated**,
 *   which detaches and renders against the born text (§6.1 "never pins to wrong
 *   code").
 */
export function reanchorRange(
  born: readonly string[],
  current: readonly string[],
  range: readonly [number, number],
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

/** The current-Change facts a code anchor is judged against — all synchronous from the patch. */
export interface AnchorContext {
  /** The blob sha on the anchor's own side in the current Change; absent ⇒ file unchanged base..head. */
  currentSideSha?: string;
  /** The file is deleted in the current Change. */
  deleted?: boolean;
  /** The file is renamed away from the anchor's born path. */
  renamed?: boolean;
}

/**
 * A drift decision: either a state settled by a §6.1 fast path, or a request to
 * fetch the born and current blobs and run `reanchorRange`.
 */
export type DriftPlan =
  | { kind: "resolved"; state: DriftState }
  | { bornSha: string; currentSha: string; kind: "reanchor"; range: [number, number] };

/**
 * Apply the §6.1 fast paths, returning either a settled state or a re-anchor
 * request. `change` never drifts; `file` drifts only on delete/rename; a `line`
 * whose born blob still equals the current side blob is live without computing;
 * a `line` in a file absent from the change is live (unchanged base..head).
 * Identity arms (walkthrough/capture/text-span) carry no content-addressed
 * drift here and stay live.
 */
export function planDrift(anchor: Anchor, ctx: AnchorContext): DriftPlan {
  if (anchor.kind === "file") {
    const state: DriftState = ctx.deleted || ctx.renamed ? "outdated" : "live";
    return { kind: "resolved", state };
  }
  if (anchor.kind === "line") {
    if (ctx.currentSideSha === undefined || ctx.currentSideSha === anchor.blobSha) {
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

/** A drift badge — an informational note, a re-check signal, or a settled marker. */
export interface DriftBadge {
  label: string;
  tone: "info" | "signal" | "muted";
}

/**
 * The (drift × resolved) matrix as a badge (data-model.md §6.3). `live` carries
 * none; `shifted` is always an informational "moved" note; `outdated` is a
 * re-check signal while unresolved and the settled end state once resolved.
 */
export function driftBadge(state: DriftState, resolved: boolean): DriftBadge | undefined {
  if (state === "shifted") {
    return { label: "Shifted", tone: "info" };
  }
  if (state === "outdated") {
    return resolved ? { label: "Outdated", tone: "muted" } : { label: "Re-check", tone: "signal" };
  }
  return undefined;
}

/** What a milestone record did to the Finding. */
export type ChangeVerb = "opened" | "replied" | "resolved" | "reopened";

/** One cross-Change milestone: what happened and the Change it was authored on. */
export interface ChangeEvent {
  changeId: string;
  verb: ChangeVerb;
}

const RECORD_VERB: Partial<Record<FindingRecord["type"], ChangeVerb>> = {
  open: "opened",
  reopen: "reopened",
  reply: "replied",
  resolve: "resolved",
};

/**
 * Fold a Finding's records into its cross-Change timeline (diff-review.md §7):
 * each milestone (open/reply/resolve/reopen) tagged with the `changeId` current
 * when it was authored. Edit records are not milestones, and consecutive
 * milestones of the same kind collapse into one — so a burst of replies reads as
 * a single "replied on …".
 */
export function changeHistory(records: readonly FindingRecord[]): ChangeEvent[] {
  const ordered = records.toSorted((left, right) => left.name.localeCompare(right.name));
  const events: ChangeEvent[] = [];
  for (const record of ordered) {
    const verb = RECORD_VERB[record.type];
    if (verb !== undefined && events.at(-1)?.verb !== verb) {
      events.push({ changeId: record.changeId, verb });
    }
  }
  return events;
}

/** The cross-Change timeline as a one-line label, e.g. `opened on chg_001 · resolved on chg_004`. */
export function changeHistoryLabel(records: readonly FindingRecord[]): string {
  return changeHistory(records)
    .map((event) => `${event.verb} on ${event.changeId}`)
    .join(" · ");
}
