export const PendingRange = {
  Cumulative: "cumulative",
  Incremental: "incremental",
} as const;

export type PendingRange = (typeof PendingRange)[keyof typeof PendingRange];

export const pendingRanges = Object.values(PendingRange);
