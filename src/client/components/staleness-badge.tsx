import type { Staleness } from "@shared/lib/walkthrough";

const staleStyle: React.CSSProperties = {
  background: "rgba(210,153,34,0.2)",
  borderRadius: "0.35rem",
  color: "#d29922",
  fontSize: "0.75rem",
  padding: "0.05rem 0.45rem",
  whiteSpace: "nowrap",
};

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
    <span style={staleStyle}>
      {staleness.behind} change{staleness.behind === 1 ? "" : "s"} behind
    </span>
  );
}
