import { Badge } from "@client/components/ui/badge";
import type { Staleness } from "@shared/lib/walkthrough-annotations";
import { ClockFading } from "lucide-react";
import plur from "plur";

export function WalkthroughStaleness({ staleness }: { staleness: Staleness }) {
  if (!staleness.stale) {
    return null;
  }

  return (
    <Badge variant="secondary" size="lg">
      <ClockFading />
      {staleness.behind} {plur("change", staleness.behind)} behind
    </Badge>
  );
}
