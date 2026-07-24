import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@client/components/ui/resizable";
import { ScrollArea } from "@client/components/ui/scroll-area";
import type { ReactNode, RefObject } from "react";
import { useDefaultLayout } from "react-resizable-panels";

export function WalkthroughLayout({
  children,
  id,
  proseRef,
  target,
}: {
  children: ReactNode;
  id: string;
  proseRef: RefObject<HTMLDivElement | null>;
  target: ReactNode;
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id,
    storage: localStorage,
  });

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="overflow-visible! h-[calc(100svh-(--spacing(12.5)))]!"
    >
      <ResizablePanel
        defaultSize="37em"
        minSize={320}
        id="prose"
        className="overflow-visible!"
      >
        <ScrollArea viewportRef={proseRef} scrollFade>
          {/* pb lets the last section's anchor scroll up to the read line;
                without it the final target could never become active. */}
          <div className="p-6 pb-[50%]">
            <div className="typeset typeset-walkthrough mx-auto max-w-[37em] antialiased">
              {children}
            </div>
          </div>
        </ScrollArea>
      </ResizablePanel>

      <ResizableHandle withHandle className="w-1.5" />

      <ResizablePanel minSize={320} id="target" className="overflow-visible!">
        {target}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
