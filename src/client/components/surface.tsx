import { cn } from "@client/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type React from "react";

/**
 * The app's base surface: card background, hairline border, and the inset
 * `before:` highlight that fakes a 1px bevel. The `radius` variant couples the
 * outer corner radius with the highlight's inset radius (the matching
 * `--radius-{lg,2xl}` token minus 1px) so the bevel always tracks the corner.
 */
const surface = cva(
  "relative flex flex-col border bg-card not-dark:bg-clip-padding text-card-foreground shadow-xs/5 before:pointer-events-none before:absolute before:inset-0 before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
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
}: React.ComponentProps<"div"> & VariantProps<typeof surface>) {
  return (
    <div
      className={cn(surface({ radius }), className)}
      data-slot="surface"
      {...props}
    />
  );
}
