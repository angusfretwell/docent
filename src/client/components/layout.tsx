import { Skeleton } from "@client/components/ui/skeleton";
import { FindingsPanel } from "@client/features/findings/panel";
import { useMediaQuery } from "@client/hooks/use-media-query";
import { findingsOpenAtom } from "@client/lib/preferences";
import { useAtomValue } from "jotai/react";
import { Suspense } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import { Header } from "./header";
import { Pane } from "./pane";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";

export function Layout({ children }: { children: React.ReactNode }) {
  const findingsOpen = useAtomValue(findingsOpenAtom);
  const isMobile = useMediaQuery("max-md");

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "main",
    storage: localStorage,
  });

  return (
    <div className="flex h-svh flex-col">
      <Header />

      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="h-[calc(100svh-(--spacing(11)))]! overflow-visible! p-1.5 pt-0"
      >
        <ResizablePanel minSize="50%" id="main" className="overflow-visible!">
          {children}
        </ResizablePanel>

        {findingsOpen && !isMobile && (
          <>
            <ResizableHandle withHandle className="w-1.5" />
            <ResizablePanel
              groupResizeBehavior="preserve-pixel-size"
              minSize={200}
              defaultSize={350}
              id="findings"
              className="overflow-visible!"
            >
              <Suspense
                fallback={
                  <Pane>
                    <Skeleton className="h-full w-full rounded-none" />
                  </Pane>
                }
              >
                <Pane>
                  <FindingsPanel />
                </Pane>
              </Suspense>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
