import { Badge } from "@client/components/ui/badge";
import { targetAnchorProps } from "@client/features/walkthrough/hooks/use-active-target";
import { cn } from "@client/lib/utils";
import { MousePointer2 } from "lucide-react";
import type { ReactNode } from "react";

export interface TargetLabel {
  detail?: string;
  icon: ReactNode;
  text: string;
}

export type LabelTarget = (key: string) => TargetLabel | undefined;

export function TargetChip({
  anchorKey,
  label,
  onSelect,
}: {
  anchorKey: string;
  label: TargetLabel | undefined;
  onSelect: (key: string) => void;
}) {
  // Keeps its anchor even with no chip, so the panel shows its empty state as
  // the reader passes rather than holding the previous target.
  if (label === undefined) {
    return <span aria-hidden {...targetAnchorProps(anchorKey)} />;
  }

  return (
    <Badge
      data-not-typeset
      onClick={() => onSelect(anchorKey)}
      render={<button aria-label={`Show ${label.text}`} type="button" />}
      title={label.detail}
      variant="outline"
      {...targetAnchorProps(anchorKey)}
    >
      {label.icon}
      {label.text}
    </Badge>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-not-typeset>
      {children}
    </div>
  );
}

export function PinChip({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <Badge size="sm" className={cn("z-10 tabular-nums", className)}>
      <MousePointer2 className="fill-current" />
      {label}
    </Badge>
  );
}
