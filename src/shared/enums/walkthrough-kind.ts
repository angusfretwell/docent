export const WalkthroughKind = {
  Code: "code",
  Product: "product",
} as const;

export type WalkthroughKind =
  (typeof WalkthroughKind)[keyof typeof WalkthroughKind];

export const walkthroughKinds = Object.values(WalkthroughKind);

export const WALKTHROUGH_KIND_LABEL: Record<WalkthroughKind, string> = {
  code: "Code",
  product: "Product",
};
