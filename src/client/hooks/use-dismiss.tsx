import { noop } from "radashi";
import { createContext, useContext } from "react";

const DismissContext: React.Context<() => void> =
  createContext<() => void>(noop);

export function DismissProvider({
  dismiss,
  children,
}: {
  dismiss: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <DismissContext.Provider value={dismiss}>
      {children}
    </DismissContext.Provider>
  );
}

export function useDismiss(): () => void {
  return useContext(DismissContext);
}
