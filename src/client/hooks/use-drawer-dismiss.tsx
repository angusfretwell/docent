import { createContext, useContext } from "react";

function noopDismiss() {
  // Default value: the content renders outside a drawer, so there is nothing to close.
}

const DrawerDismissContext: React.Context<() => void> =
  createContext<() => void>(noopDismiss);

/** Lets content nested in a drawer close it from an interaction handler; a no-op when that content renders outside a drawer. */
export function DrawerDismissProvider({
  dismiss,
  children,
}: {
  dismiss: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <DrawerDismissContext.Provider value={dismiss}>
      {children}
    </DrawerDismissContext.Provider>
  );
}

export function useDrawerDismiss(): () => void {
  return useContext(DrawerDismissContext);
}
