import type { FoldedFinding } from "@shared/lib/finding";

/**
 * Group narrative (`walkthrough-section`) Findings on this walkthrough by the
 * section id they anchor. Shared by both pillar tabs, each of which renders a
 * section's narrative notes inline under its title (walkthroughs.md §7).
 */
export function narrativeBySectionId(
  folded: readonly FoldedFinding[],
  walkthroughId: string
): Map<string, FoldedFinding[]> {
  const bySection = new Map<string, FoldedFinding[]>();
  for (const finding of folded) {
    const { anchor } = finding;
    if (
      anchor?.kind === "walkthrough-section" &&
      anchor.walkthroughId === walkthroughId
    ) {
      const list = bySection.get(anchor.sectionId) ?? [];
      list.push(finding);
      bySection.set(anchor.sectionId, list);
    }
  }
  return bySection;
}
