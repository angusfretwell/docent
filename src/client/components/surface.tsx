import { cn } from "@client/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type React from "react";

const surfaceVariants = cva(
  "relative flex flex-col border bg-card text-card-foreground shadow-xs/5 not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
  {
    defaultVariants: {
      radius: "2xl",
    },
    variants: {
      radius: {
        "2xl": "rounded-2xl before:rounded-[calc(var(--radius-2xl)-1px)]",
        lg: "rounded-lg before:rounded-[calc(var(--radius-lg)-1px)]",
      },
    },
  }
);

export function Surface({
  className,
  radius,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof surfaceVariants>) {
  return (
    <div
      className={cn(surfaceVariants({ radius }), className)}
      data-slot="surface"
      {...props}
    />
  );
}
