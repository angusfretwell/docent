import { cn } from "@client/lib/utils";

import { Card } from "./ui/card";

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
    <Card
      className={cn("flex flex-col h-full overflow-clip", className)}
      {...props}
    />
  );
}
