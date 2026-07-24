export const Side = {
  Base: "base",
  Head: "head",
} as const;

export type Side = (typeof Side)[keyof typeof Side];

export const sides = Object.values(Side);
