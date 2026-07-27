export const WalkthroughState = {
  Absent: "absent",
  Current: "current",
  Empty: "empty",
  Stale: "stale",
} as const;

export type WalkthroughState =
  (typeof WalkthroughState)[keyof typeof WalkthroughState];
