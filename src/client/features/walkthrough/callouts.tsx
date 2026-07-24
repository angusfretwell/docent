import { usePinHover } from "@client/features/capture/hooks/use-pin-hover";
import { cn } from "@client/lib/utils";

import { PinChip } from "./chips";

export interface LabeledCallout {
  body: string;
  label: string;
}

function CalloutItem({
  callout,
  target,
}: {
  callout: LabeledCallout;
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

export function WalkthroughCallouts({
  callouts,
  target,
}: {
  callouts: readonly LabeledCallout[];
  target?: string;
}) {
  if (callouts.length === 0) {
    return null;
  }

  return (
    <ul className="small list-none ps-[0.25em] text-[0.875em]">
      {callouts.map((callout) => (
        <CalloutItem callout={callout} key={callout.label} target={target} />
      ))}
    </ul>
  );
}
