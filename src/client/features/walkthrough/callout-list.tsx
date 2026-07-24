import { Badge } from "@client/components/ui/badge";
import { usePinHover } from "@client/features/capture/pin-hover";
import { cn } from "@client/lib/utils";

/** One pin's label and body, as the prose lists it beside the capture. */
export interface Callout {
  body: string;
  label: string;
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

/** One callout, lit while its mark on the capture is hovered, and vice versa. */
function CalloutItem({
  callout,
  target,
}: {
  callout: Callout;
  target: string | undefined;
}) {
  const { active, onClick, onPointerEnter, onPointerLeave } = usePinHover(
    target,
    callout.label
  );

  return (
    <li>
      <button
        className="cursor-pointer text-start"
        onClick={onClick}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        type="button"
      >
        <PinChip
          label={callout.label}
          className={cn(
            "me-[0.5em] align-[0.1em]",
            active ? "opacity-100" : "opacity-50"
          )}
        />
        &nbsp;<span>{callout.body}</span>
      </button>
    </li>
  );
}

/**
 * The callouts of one capture, listed where the prose reaches it. Held out of
 * the typeset flow so the surrounding prose rhythm doesn't apply to what is a
 * list of marks rather than a paragraph.
 */
export function CalloutList({
  callouts,
  target,
}: {
  callouts: readonly Callout[];
  target?: string;
}) {
  if (callouts.length === 0) {
    return null;
  }

  return (
    <ul className="list-none ps-[0.25em] small text-[0.875em]">
      {callouts.map((callout) => (
        <CalloutItem callout={callout} key={callout.label} target={target} />
      ))}
    </ul>
  );
}
