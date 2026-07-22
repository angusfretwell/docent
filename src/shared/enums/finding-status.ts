/**
 * A Finding's lifecycle, actor-blind: `open` needs someone's work, `actioned`
 * means whoever held the turn handed it back — fixed, declined, or asking a
 * question alike — and `resolved` is closed. The read-time fold that derives a
 * Finding's current status from its records lives in `lib/finding.ts`.
 */
export const FindingStatus = {
  Actioned: "actioned",
  Open: "open",
  Resolved: "resolved",
} as const;

export type FindingStatus = (typeof FindingStatus)[keyof typeof FindingStatus];

export const findingStatuses = Object.values(FindingStatus);

/** Human labels for each status — one source for every surface. */
export const STATUS_LABEL: Record<FindingStatus, string> = {
  actioned: "Actioned",
  open: "Open",
  resolved: "Resolved",
};
