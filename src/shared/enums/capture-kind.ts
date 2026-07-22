/**
 * The two media kinds a product capture holds (walkthroughs.md §6): a
 * `screenshot` (a `[Meta, FullSnapshot]` pair) or a `recording` (a whole rrweb
 * event stream).
 */
export const CaptureKind = {
  Recording: "recording",
  Screenshot: "screenshot",
} as const;

export type CaptureKind = (typeof CaptureKind)[keyof typeof CaptureKind];

export const captureKinds = Object.values(CaptureKind);
