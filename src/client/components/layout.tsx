import { findingsOpenAtom } from "@client/lib/preferences";
import { useAtomValue } from "jotai/react";
import { useDefaultLayout } from "react-resizable-panels";

import { FindingsPanel } from "./findings/panel";
import { Header } from "./header";
import { Pane } from "./pane";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";

export function Layout({ children }: { children: React.ReactNode }) {
  const findingsOpen = useAtomValue(findingsOpenAtom);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "main",
    storage: localStorage,
  });

  return (
    <div className="h-svh flex flex-col">
      <Header />

      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="p-1.5 pt-0 overflow-visible! h-[calc(100svh-(--spacing(11)))]!"
      >
        <ResizablePanel minSize="50%" id="main" className="overflow-visible!">
          {children}
        </ResizablePanel>

        {findingsOpen && (
          <>
            <ResizableHandle withHandle className="w-1.5" />
            <ResizablePanel
              groupResizeBehavior="preserve-pixel-size"
              minSize={200}
              defaultSize={350}
              id="findings"
              className="overflow-visible!"
            >
              <Pane>
                <FindingsPanel />
              </Pane>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
