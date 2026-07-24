import { Badge } from "@client/components/ui/badge";
import { cn } from "@client/lib/utils";

/**
 * A pin's label, worn identically by the mark on the capture and by the callout
 * that carries its body in the prose. The two sit in different columns, so the
 * label is the only thing tying them together — it has to read the same in both.
 */
export function PinChip({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <Badge size="sm" className={cn("tabular-nums", className)}>
      {label}
    </Badge>
  );
}
