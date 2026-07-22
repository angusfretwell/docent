/**
 * The anchor `kind` discriminant (data-model.md §5.3): seven arms across the
 * three pillars. The values are named once here so the anchor schema
 * (`schemas/finding.ts`) and every fold read the same token.
 */
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
