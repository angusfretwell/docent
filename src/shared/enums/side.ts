/** The two sides of a Change a code anchor or range pins to (data-model.md §5.3). */
export const Side = {
  Base: "base",
  Head: "head",
} as const;

export type Side = (typeof Side)[keyof typeof Side];

export const sides = Object.values(Side);
