import type { WalkthroughKind } from "@shared/enums/walkthrough-kind";

/** Where a section finding is read, and how to get there. */
export interface FindingSection {
  key: string;
  pillar: WalkthroughKind;
}
