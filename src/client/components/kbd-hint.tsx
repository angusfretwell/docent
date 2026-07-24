import type React from "react";

import { Kbd } from "./ui/kbd";

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
