/**
 * Bucketing Findings by the walkthrough section they anchor to, so a tour can
 * hand each step its own threads instead of every step scanning the Review's
 * whole finding set. Pure — no React or DOM here.
 */

import { ANCHOR_KIND } from "@shared/enums/anchor-kind";
import type { FoldedFinding } from "@shared/lib/finding";

/** The key a `walkthrough-section` anchor buckets under. */
export function sectionKey(walkthroughId: string, sectionId: string): string {
  return `${walkthroughId}/${sectionId}`;
}

/**
 * Every section-anchored Finding, grouped by its section. Anchors of any other
 * kind belong to a different surface (the diff, a capture, the whole change) and
 * are dropped here rather than falling through to some arbitrary section.
 */
export function findingsBySection(
  findings: readonly FoldedFinding[]
): ReadonlyMap<string, readonly FoldedFinding[]> {
  const bySection = new Map<string, FoldedFinding[]>();

  for (const finding of findings) {
    const { anchor } = finding;

    if (anchor?.kind !== ANCHOR_KIND.walkthroughSection) {
      continue;
    }

    const key = sectionKey(anchor.walkthroughId, anchor.sectionId);
    const bucket = bySection.get(key);

    if (bucket === undefined) {
      bySection.set(key, [finding]);
    } else {
      bucket.push(finding);
    }
  }

  return bySection;
}
