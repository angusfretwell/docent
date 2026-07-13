/**
 * Per-range walkthrough drift — the Finding re-anchor reused verbatim, one range
 * at a time (walkthroughs.md §8). A range IS a `line` anchor (`rangeAnchor`), so
 * `planDrift` settles the fast paths and `reanchorRange` resolves the rest — no
 * second drift algorithm. The plan is triaged into drift buckets by the shared
 * `triagePlan` (client/drift.ts), the same reducer step the Finding drift map
 * uses, keyed by the range key instead of a Finding id; `useRangeDrift` is the
 * thin React wiring that resolves the re-anchors lazily and folds them in as they
 * land.
 */

import {
  anchorContext,
  indexDiffFiles,
  triagePlan,
  useReanchor,
} from "@client/lib/drift";
import type { DriftResult, ExcerptJob, ReanchorJob } from "@client/lib/drift";
import { planDrift } from "@shared/lib/drift";
import { rangeAnchor } from "@shared/lib/walkthrough-annotations";
import type { WalkthroughRange } from "@shared/schemas/walkthrough";

/** A range plus the stable key its drift is published under. */
export interface KeyedRange {
  key: string;
  range: WalkthroughRange;
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
  patch: string
): ReadonlyMap<string, DriftResult> {
  const files = indexDiffFiles(patch);

  const base = new Map<string, DriftResult>();
  const jobs: ReanchorJob[] = [];
  const excerpts: ExcerptJob[] = [];
  for (const keyed of ranges) {
    const anchor = rangeAnchor(keyed.range);
    const plan = planDrift(anchor, anchorContext(anchor, files));
    const lines: [number, number] = [
      keyed.range.lines[0],
      keyed.range.lines[1],
    ];
    const triage = triagePlan(keyed.key, plan, lines);
    if (triage.base !== undefined) {
      base.set(keyed.key, triage.base);
    }
    if (triage.job !== undefined) {
      jobs.push(triage.job);
    }
    if (triage.excerpt !== undefined) {
      excerpts.push(triage.excerpt);
    }
  }

  const resolved = useReanchor(jobs, excerpts);

  const merged = new Map(base);
  for (const [key, result] of resolved) {
    merged.set(key, result);
  }
  return merged;
}
