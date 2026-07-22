import type React from "react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "./ui/empty";

/**
 * The icon-over-caption empty state: a bordered icon tile above one line of
 * muted description. Wraps the `Empty > EmptyHeader > EmptyMedia + Description`
 * shape the single-line empties share. Richer empties (title, actions) stay on
 * the raw `Empty` parts — see `error.tsx`.
 */
export function IconEmpty({
  className,
  children,
  icon,
}: {
  className?: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
