/** The two walkthrough kinds a Review tracks (walkthroughs.md §4). */
export const WalkthroughKind = {
  Code: "code",
  Product: "product",
} as const;

export type WalkthroughKind =
  (typeof WalkthroughKind)[keyof typeof WalkthroughKind];

export const walkthroughKinds = Object.values(WalkthroughKind);

/** Human labels for each pillar — one source for every surface that names a kind. */
export const WALKTHROUGH_KIND_LABEL: Record<WalkthroughKind, string> = {
  code: "Code",
  product: "Product",
};
