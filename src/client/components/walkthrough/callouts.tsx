import { cn } from "@client/lib/utils";
import type { Callout } from "@client/lib/walkthrough-pins";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

import { Badge } from "../ui/badge";

/**
 * Which pin the reader is dwelling on, shared across the two columns. A label is
 * only unique within its capture, so the target key it was placed under is part
 * of the identity — otherwise `A1` in one capture's callouts would light up `A1`
 * on whatever capture the panel currently holds.
 */
export interface PinKey {
  label: string;
  target: string;
}

/**
 * A request to bring one pin's region into view, carrying a nonce so that asking
 * for the same pin twice reads as two requests — otherwise a reader who framed a
 * pin, zoomed away by hand, then clicked it again would get nothing.
 */
interface PinFocus {
  key: PinKey;
  nonce: number;
}

interface PinHover {
  focus: (pin: PinKey) => void;
  focused: PinFocus | undefined;
  hovered: PinKey | undefined;
  setHovered: (pin: PinKey | undefined) => void;
}

const PinHoverContext = createContext<PinHover | undefined>(undefined);

/**
 * Holds the hovered pin for one pillar. The mark on the capture and the callout
 * in the prose sit in different panels with no DOM ancestry in common, so CSS
 * `:hover` can't reach from one to the other — the pairing has to be state.
 *
 * Every callout reads in the prose, but only one capture is on the panel, so a
 * focus request routinely names a pin on a capture that isn't showing. `onFocus`
 * is what brings that capture on: the request then stands until the capture
 * mounts and serves it, so one click switches and frames rather than doing
 * nothing until the reader has scrolled there themselves.
 */
export function PinHoverProvider({
  children,
  onFocus,
}: {
  children: ReactNode;
  onFocus?: (target: string) => void;
}) {
  const [hovered, setHovered] = useState<PinKey | undefined>();
  const [focused, setFocused] = useState<PinFocus | undefined>();

  const value = useMemo(
    () => ({
      focus: (pin: PinKey) => {
        onFocus?.(pin.target);

        setFocused((previous) => ({
          key: pin,
          nonce: (previous?.nonce ?? 0) + 1,
        }));
      },
      focused,
      hovered,
      setHovered,
    }),
    [focused, hovered, onFocus]
  );

  return <PinHoverContext value={value}>{children}</PinHoverContext>;
}

/**
 * Whether this pin is the hovered one, and the handlers that make it so. Both
 * halves of a pin drive their styling off `active` rather than their own
 * `:hover`, so either half lighting up lights up the other by the same path.
 * `onClick` asks the capture to frame the pin's region, from whichever half the
 * reader clicked.
 *
 * A pin with no target key can't be paired — nothing identifies which capture it
 * belongs to — so it reports inactive and its handlers are inert.
 */
export function usePinHover(target: string | undefined, label: string) {
  const context = useContext(PinHoverContext);
  const pairable = context !== undefined && target !== undefined;

  return {
    active:
      pairable &&
      context.hovered?.label === label &&
      context.hovered.target === target,
    onClick: () => {
      if (pairable) {
        context.focus({ label, target });
      }
    },
    onPointerEnter: () => {
      if (pairable) {
        context.setHovered({ label, target });
      }
    },
    onPointerLeave: () => {
      if (pairable) {
        context.setHovered(undefined);
      }
    },
  };
}

/** The standing request to frame a pin, for the capture that has to satisfy it. */
export function usePinFocus() {
  return useContext(PinHoverContext)?.focused;
}

/**
 * The pin being dwelt on, for a capture that answers hover with more than
 * styling. `usePinHover` tells one pin whether it is the hovered one; this tells
 * a panel which pin that is, so a replay can go and demonstrate it.
 */
export function usePinHovered() {
  return useContext(PinHoverContext)?.hovered;
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
