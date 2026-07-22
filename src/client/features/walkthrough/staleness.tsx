import { Badge } from "@client/components/ui/badge";
import type { Staleness } from "@shared/lib/walkthrough-annotations";
import { ClockFading } from "lucide-react";

/**
 * How far behind head the tour was authored (walkthroughs.md §8) — surfaced,
 * never hidden, so a reader knows the prose describes older code than the diff
 * beside it.
 */
export function StalenessBadge({ staleness }: { staleness: Staleness }) {
  if (!staleness.stale) {
    return null;
  }

  return (
    <Badge variant="secondary" size="lg">
      <ClockFading />
      {staleness.behind} change{staleness.behind === 1 ? "" : "s"} behind
    </Badge>
  );
}
