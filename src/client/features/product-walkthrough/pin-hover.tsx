import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

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
