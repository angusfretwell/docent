import { Badge } from "@client/ui/badge";
import type { Staleness } from "@shared/lib/walkthrough-annotations";

/**
 * The "N changes behind" badge (walkthroughs.md §8), shown once atop a pillar
 * tab when the walkthrough's `bornChangeId` trails the reviewed Change's head.
 * Renders nothing while current.
 */
export function StalenessBadge({ staleness }: { staleness: Staleness }) {
  if (!staleness.stale) {
    return null;
  }
  return (
    <Badge variant="warning">
      {staleness.behind} change{staleness.behind === 1 ? "" : "s"} behind
    </Badge>
  );
}
