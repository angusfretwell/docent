import { cn } from "@client/lib/utils";

import { Surface } from "./surface";

export function Pane({
  className,
  unstyled = false,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  unstyled?: boolean;
}) {
  if (unstyled) {
    return <div className="flex h-full flex-col overflow-clip" {...props} />;
  }

  return (
    <Surface
      className={cn("flex h-full flex-col overflow-clip", className)}
      {...props}
    />
  );
}
