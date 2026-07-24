import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@client/components/ui/resizable";
import { ScrollArea } from "@client/components/ui/scroll-area";
import { Tabs, TabsList, TabsTab } from "@client/components/ui/tabs";
import { useIsMobile } from "@client/hooks/use-media-query";
import { cn } from "@client/lib/utils";
import { BookOpenText } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useDefaultLayout } from "react-resizable-panels";

export type WalkthroughPane = "prose" | "target";

export function WalkthroughLayout({
  children,
  id,
  onPaneChange,
  pane = "prose",
  proseRef,
  target,
  targetIcon,
  targetLabel = "Target",
}: {
  children: ReactNode;
  id: string;
  onPaneChange?: (pane: WalkthroughPane) => void;
  pane?: WalkthroughPane;
  proseRef: RefObject<HTMLDivElement | null>;
  target: ReactNode;
  targetIcon?: ReactNode;
  targetLabel?: string;
}) {
  const isMobile = useIsMobile();

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id,
    storage: localStorage,
  });

  const prose = (
    <ScrollArea viewportRef={proseRef} scrollFade>
      {/* pb lets the last section's anchor scroll up to the read line;
            without it the final target could never become active. */}
      <div className="p-4 sm:p-6 sm:pb-[50%]">
        <div className="typeset typeset-walkthrough mx-auto max-w-[37em] antialiased">
          {children}
        </div>
      </div>
    </ScrollArea>
  );

  if (isMobile) {
    return (
      <div className="flex h-[calc(100svh-(--spacing(12.5)))] flex-col">
        {/* Both panes stay mounted with layout geometry: the active-target
            observer measures the prose container, so hiding it with `display`
            would zero its anchors and scramble the reading. */}
        <div className="relative min-h-0 flex-1">
          <div
            className={cn(
              "absolute inset-0",
              pane !== "prose" && "pointer-events-none invisible"
            )}
          >
            {prose}
          </div>

          <div
            className={cn(
              "absolute inset-0",
              pane !== "target" && "pointer-events-none invisible"
            )}
          >
            {target}
          </div>
        </div>

        <div className="shrink-0 pt-1.5 pb-[env(safe-area-inset-bottom,0px)]">
          <Tabs
            onValueChange={(value) => onPaneChange?.(value as WalkthroughPane)}
            value={pane}
          >
            <TabsList className="w-full">
              <TabsTab className="basis-0" value="prose">
                <BookOpenText />
                Walkthrough
              </TabsTab>
              <TabsTab className="basis-0" value="target">
                {targetIcon}
                {targetLabel}
              </TabsTab>
            </TabsList>
          </Tabs>
        </div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="h-[calc(100svh-(--spacing(12.5)))]! overflow-visible!"
    >
      <ResizablePanel
        defaultSize="37em"
        minSize={320}
        id="prose"
        className="overflow-visible!"
      >
        {prose}
      </ResizablePanel>

      <ResizableHandle withHandle className="w-1.5" />

      <ResizablePanel minSize={320} id="target" className="overflow-visible!">
        {target}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
