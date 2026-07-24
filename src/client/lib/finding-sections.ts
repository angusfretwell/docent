import { ANCHOR_KIND } from "@shared/enums/anchor-kind";
import type { FoldedFinding } from "@shared/lib/finding";

export function sectionKey(walkthroughId: string, sectionId: string): string {
  return `${walkthroughId}/${sectionId}`;
}

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
