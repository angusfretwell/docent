import type React from "react";

import {
  Empty as BaseEmpty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "./ui/empty";

export function Empty({
  className,
  children,
  icon,
}: {
  className?: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <BaseEmpty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </BaseEmpty>
  );
}
