import { Badge } from "@client/components/ui/badge";
import { targetAnchorProps } from "@client/features/walkthrough/hooks/use-active-target";
import { cn } from "@client/lib/utils";
import type { ReactNode } from "react";

/** How a target reads on its chip: a short label, with the full reference behind it. */
export interface TargetLabel {
  detail?: string;
  /** The mark naming what kind of target this is — a file, a screenshot, a recording. */
  icon: ReactNode;
  text: string;
}

/** Resolves a target key to its chip label, or `undefined` if the tour can't reach it. */
export type LabelTarget = (key: string) => TargetLabel | undefined;

/**
 * One target as a chip: the anchor the active-target reading keys off, and the
 * control that aims the panel at it deliberately.
 */
export function TargetChip({
  anchorKey,
  label,
  onSelect,
}: {
  anchorKey: string;
  label: TargetLabel | undefined;
  onSelect: (key: string) => void;
}) {
  // A target the walkthrough can't resolve gets no chip — there is nothing to
  // name it with — but it keeps its anchor, so the panel still shows its empty
  // state as the reader passes rather than holding the previous target.
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

/** Chips placed around the prose rather than inside it, kept off the typeset flow. */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-not-typeset>
      {children}
    </div>
  );
}

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
