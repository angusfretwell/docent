export const FindingStatus = {
  Actioned: "actioned",
  Open: "open",
  Resolved: "resolved",
} as const;

export type FindingStatus = (typeof FindingStatus)[keyof typeof FindingStatus];

export const findingStatuses = Object.values(FindingStatus);

export const STATUS_LABEL: Record<FindingStatus, string> = {
  actioned: "Actioned",
  open: "Open",
  resolved: "Resolved",
};
