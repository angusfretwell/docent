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
    return <div className="flex flex-col h-full overflow-clip" {...props} />;
  }

  return (
    <Surface
      className={cn("flex flex-col h-full overflow-clip", className)}
      {...props}
    />
  );
}
