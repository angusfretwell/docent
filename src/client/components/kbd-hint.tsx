import type React from "react";

import { Kbd } from "./ui/kbd";

export function KbdHint({
  active,
  children,
  shortcut,
  className,
}: {
  className?: string;
  active: boolean;
  children: React.ReactNode;
  shortcut: React.ReactNode;
}): React.ReactNode {
  return active ? <Kbd className={className}>{shortcut}</Kbd> : children;
}
