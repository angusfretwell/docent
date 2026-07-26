import type { ReactNode } from "react";
import { createContext, use, useCallback, useMemo, useState } from "react";

/**
 * A label is only unique within its capture, so the target key it was placed
 * under is part of the identity — otherwise `1.1` in one capture's callouts
 * would light up `1.1` on whatever capture the panel currently holds.
 */
export interface PinKey {
  label: string;
  target: string;
}

/** The nonce makes asking for the same pin twice read as two requests. */
interface PinFocus {
  key: PinKey;
  nonce: number;
}

interface PinHover {
  focus: (pin: PinKey) => void;
  focused: PinFocus | undefined;
  hovered: PinKey | undefined;
  serve: (nonce: number) => void;
  setHovered: (pin: PinKey | undefined) => void;
}

const PinHoverContext = createContext<PinHover | undefined>(undefined);

/**
 * The mark on the capture and the callout in the prose sit in different panels
 * with no common DOM ancestry, so CSS `:hover` can't reach from one to the other
 * — the pairing has to be state. `onFocus` brings on a capture that isn't
 * showing; the request stands until it mounts and serves it, and is dropped
 * there: a capture is unmounted whenever the reader scrolls past it, so a
 * request left standing would frame again on the way back, over whatever the
 * reader has done to the view since.
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

  // By nonce, so a request made while the previous one was being served isn't
  // dropped along with it.
  const serve = useCallback((nonce: number) => {
    setFocused((previous) =>
      previous?.nonce === nonce ? undefined : previous
    );
  }, []);

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
      serve,
      setHovered,
    }),
    [focused, hovered, onFocus, serve]
  );

  return <PinHoverContext value={value}>{children}</PinHoverContext>;
}

/**
 * A pin with no target key can't be paired — nothing identifies which capture it
 * belongs to — so it reports inactive and its handlers are inert.
 */
export function usePinHover(target: string | undefined, label: string) {
  const context = use(PinHoverContext);
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

export function usePinFocus() {
  const context = use(PinHoverContext);

  return { focused: context?.focused, serve: context?.serve };
}

export function usePinHovered() {
  return use(PinHoverContext)?.hovered;
}
