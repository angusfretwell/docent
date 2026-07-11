/**
 * Per-range walkthrough drift — the Finding re-anchor reused verbatim, one range
 * at a time (walkthroughs.md §8). A range IS a `line` anchor (`rangeAnchor`), so
 * `planDrift` settles the fast paths and `reanchorRange` resolves the rest — no
 * second drift algorithm. `planRange` is the pure seam (parsed patch in, a
 * settled result or a fetch request out), so the fast-path decisions are
 * unit-tested; `useRangeDrift` is the thin React wiring that resolves the
 * re-anchors lazily and folds them in as they land.
 */

import { planDrift } from "@shared/lib/drift";
import { rangeAnchor } from "@shared/lib/walkthrough";
import type { WalkthroughRange } from "@shared/schemas/walkthrough";
import { isRealObjectId } from "./blobs";
import { anchorContext, indexDiffFiles, useReanchor } from "./drift";
import type { DiffFile, DriftResult, ExcerptJob, ReanchorJob } from "./drift";

/** A range plus the stable key its drift is published under. */
export interface KeyedRange {
  key: string;
  range: WalkthroughRange;
}

/**
 * A range's drift plan against the current patch: a state settled synchronously,
 * a blob-to-blob re-anchor to run, or a born-only excerpt (the current side is
 * gone, so it is outdated but its born text is still addressable). Mirrors the
 * Finding drift triage (client/drift.ts), keyed by the range instead of a
 * Finding id.
 */
export type RangePlan =
  | { key: string; kind: "resolved"; result: DriftResult }
  | { bornSha: string; currentSha: string; key: string; kind: "reanchor"; range: [number, number] }
  | { bornSha: string; key: string; kind: "excerpt"; range: [number, number] };

/**
 * Plan one range's drift from the indexed patch. A range unchanged base..head is
 * live at its born lines; a changed file requests a re-anchor against the current
 * side blob; a deleted current side settles outdated and asks only for the born
 * text to detach against (data-model.md §6.1).
 */
export function planRange(keyed: KeyedRange, files: ReadonlyMap<string, DiffFile>): RangePlan {
  const anchor = rangeAnchor(keyed.range);
  const plan = planDrift(anchor, anchorContext(anchor, files));
  const range: [number, number] = [keyed.range.lines[0], keyed.range.lines[1]];
  if (plan.kind === "resolved") {
    return { key: keyed.key, kind: "resolved", result: { lines: range, state: plan.state } };
  }
  if (isRealObjectId(plan.currentSha)) {
    return {
      bornSha: plan.bornSha,
      currentSha: plan.currentSha,
      key: keyed.key,
      kind: "reanchor",
      range,
    };
  }
  if (isRealObjectId(plan.bornSha)) {
    return { bornSha: plan.bornSha, key: keyed.key, kind: "excerpt", range };
  }
  return { key: keyed.key, kind: "resolved", result: { lines: range, state: "outdated" } };
}

/**
 * The per-range drift map, keyed by each range's stable key. Fast-path results
 * are ready synchronously; a re-anchor is fetched lazily by the shared
 * `useReanchor` engine and folded in as it resolves, so the map only grows more
 * precise — a range whose re-anchor is still in flight simply reads live at its
 * born lines until the fetch lands, never mis-pinned.
 */
export function useRangeDrift(
  ranges: readonly KeyedRange[],
  patch: string,
): ReadonlyMap<string, DriftResult> {
  const files = indexDiffFiles(patch);
  const plans = ranges.map((keyed) => planRange(keyed, files));

  const base = new Map<string, DriftResult>();
  const jobs: ReanchorJob[] = [];
  const excerpts: ExcerptJob[] = [];
  for (const plan of plans) {
    if (plan.kind === "resolved") {
      base.set(plan.key, plan.result);
    } else if (plan.kind === "reanchor") {
      jobs.push({
        bornSha: plan.bornSha,
        currentSha: plan.currentSha,
        id: plan.key,
        range: plan.range,
      });
    } else {
      base.set(plan.key, { lines: plan.range, state: "outdated" });
      excerpts.push({ bornSha: plan.bornSha, id: plan.key, range: plan.range });
    }
  }

  const resolved = useReanchor(jobs, excerpts);

  const merged = new Map(base);
  for (const [key, result] of resolved) {
    merged.set(key, result);
  }
  return merged;
}
