export const CaptureKind = {
  Recording: "recording",
  Screenshot: "screenshot",
} as const;

export type CaptureKind = (typeof CaptureKind)[keyof typeof CaptureKind];

export const captureKinds = Object.values(CaptureKind);
