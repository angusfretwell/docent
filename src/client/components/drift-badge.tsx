/**
 * The (drift × resolved) badge as a pill, shared by the Findings panel and the
 * inline diff so a Finding's drift reads the same on both surfaces
 * (data-model.md §6.3). `shifted` is a quiet informational note; an unresolved
 * `outdated` is a louder re-check signal; a resolved `outdated` is a muted
 * settled marker. `live` renders nothing.
 */

import { driftBadge } from "@shared/lib/drift";
import type { DriftState } from "@shared/schemas/drift";

/** The re-check accent — shared with the panel's detached born-text rail so one restyle moves both. */
export const DRIFT_SIGNAL = "224,108,32";

const TONE_STYLE: Record<"info" | "signal" | "muted", React.CSSProperties> = {
  info: { background: "rgba(56,132,255,0.18)", color: "#4c8dff" },
  muted: { background: "rgba(128,128,128,0.18)", opacity: 0.75 },
  signal: { background: `rgba(${DRIFT_SIGNAL},0.2)`, color: "#e0863c" },
};

const baseStyle: React.CSSProperties = {
  borderRadius: "0.35rem",
  fontSize: "0.7rem",
  padding: "0.05rem 0.4rem",
  whiteSpace: "nowrap",
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
    <span style={{ ...baseStyle, ...TONE_STYLE[badge.tone] }}>
      {badge.label}
    </span>
  );
}
