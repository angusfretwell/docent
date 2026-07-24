import { Button, type ButtonProps } from "@client/components/ui/button";
import { cn } from "@client/lib/utils";

/**
 * The ghost trigger shared by the toolbar's menu buttons — the change-range
 * picker and the findings filter — so their weight and text scale stay in step
 * and a tweak lands on both at once. It spreads through to {@link Button}, so it
 * drops into Base UI's `render` prop like a bare `<Button>` and takes the menu's
 * injected props and children.
 */
export function MenuTriggerButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      className={cn("font-normal text-[13px]!", className)}
      size="sm"
      variant="ghost"
      {...props}
    />
  );
}
