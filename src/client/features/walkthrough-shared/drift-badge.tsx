/**
 * The (drift × resolved) badge as a pill, shared by the Findings panel and the
 * inline diff so a Finding's drift reads the same on both surfaces
 * (data-model.md §6.3). `shifted` is a quiet informational note; an unresolved
 * `outdated` is a louder re-check signal; a resolved `outdated` is a muted
 * settled marker. `live` renders nothing.
 */

import type { BadgeProps } from "@client/ui/badge";
import { Badge } from "@client/ui/badge";
import { driftBadge } from "@shared/lib/drift";
import type { DriftState } from "@shared/schemas/drift";

const TONE_VARIANT: Record<"info" | "signal" | "muted", BadgeProps["variant"]> =
  {
    info: "info",
    muted: "secondary",
    signal: "signal",
  };

/** The drift pill for a Finding, or nothing when it is live (no drift). */
export function DriftPill({
  resolved,
  state,
}: {
  resolved: boolean;
  state: DriftState;
}) {
  const badge = driftBadge(state, resolved);
  if (badge === undefined) {
    return null;
  }
  return (
    <Badge
      className={badge.tone === "muted" ? "text-muted-foreground" : undefined}
      size="sm"
      variant={TONE_VARIANT[badge.tone]}
    >
      {badge.label}
    </Badge>
  );
}
