/** A content-addressed anchor's standing against the newest Change (data-model.md §6.1). */
export const DriftState = {
  Live: "live",
  Outdated: "outdated",
  Shifted: "shifted",
} as const;

export type DriftState = (typeof DriftState)[keyof typeof DriftState];

export const driftStates = Object.values(DriftState);
