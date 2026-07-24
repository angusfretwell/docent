import { ANCHOR_KIND } from "@shared/enums/anchor-kind";
import type { FoldedComment } from "@shared/lib/comment";

export function sectionKey(walkthroughId: string, sectionId: string): string {
  return `${walkthroughId}/${sectionId}`;
}

export function commentsBySection(
  comments: readonly FoldedComment[]
): ReadonlyMap<string, readonly FoldedComment[]> {
  const bySection = new Map<string, FoldedComment[]>();

  for (const comment of comments) {
    const { anchor } = comment;

    if (anchor?.kind !== ANCHOR_KIND.walkthroughSection) {
      continue;
    }

    const key = sectionKey(anchor.walkthroughId, anchor.sectionId);
    const bucket = bySection.get(key);

    if (bucket === undefined) {
      bySection.set(key, [comment]);
    } else {
      bucket.push(comment);
    }
  }

  return bySection;
}
