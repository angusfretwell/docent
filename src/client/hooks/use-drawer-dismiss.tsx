import { createContext, useContext } from "react";

function noopDismiss() {
  // No drawer above this content, so there is nothing to close.
}

const DrawerDismissContext: React.Context<() => void> =
  createContext<() => void>(noopDismiss);

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
