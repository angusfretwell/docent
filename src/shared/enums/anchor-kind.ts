export const ANCHOR_KIND = {
  change: "change",
  file: "file",
  line: "line",
  recordingTimestamp: "recording-timestamp",
  screenshotRegion: "screenshot-region",
  textSpan: "text-span",
  walkthroughSection: "walkthrough-section",
} as const;

export type AnchorKind = (typeof ANCHOR_KIND)[keyof typeof ANCHOR_KIND];

export const anchorKinds = Object.values(ANCHOR_KIND);
