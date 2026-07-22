import type React from "react";

import { Kbd } from "./ui/kbd";

/**
 * An icon-button's glyph that flips to its keyboard shortcut while a modifier is
 * held: `children` (the icon) by default, a `<Kbd>` of `shortcut` when `active`.
 */
export function KbdHint({
  active,
  children,
  shortcut,
}: {
  active: boolean;
  children: React.ReactNode;
  shortcut: React.ReactNode;
}): React.ReactNode {
  return active ? <Kbd>{shortcut}</Kbd> : children;
}
