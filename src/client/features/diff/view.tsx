import { Pane } from "@client/components/pane";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@client/components/ui/resizable";
import { useIsMobile } from "@client/hooks/use-media-query";
import { useResettablePanel } from "@client/hooks/use-panel-reset";
import { diffTreeOpenAtom } from "@client/lib/preferences";
import { useAtomValue } from "jotai/react";
import { useDefaultLayout } from "react-resizable-panels";

import { DiffCodeView } from "./code-view";
import { useDiffView } from "./hooks/use-diff-view";
import { DiffToolbar } from "./toolbar";
import { DiffTree } from "./tree";

const TREE_SIZE = 250;

export function DiffView() {
  const { canAuthor, driftFor, files, viewed, viewedCount, visibleFiles } =
    useDiffView();

  const isMobile = useIsMobile();
  const diffTreeOpen = useAtomValue(diffTreeOpenAtom);
  const treePanelRef = useResettablePanel(TREE_SIZE);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "diff",
    storage: localStorage,
  });

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="h-[calc(100svh-(--spacing(12.5)))]! overflow-visible!"
    >
      {diffTreeOpen && !isMobile && (
        <>
          <ResizablePanel
            defaultSize={TREE_SIZE}
            minSize={200}
            id="tree"
            panelRef={treePanelRef}
            groupResizeBehavior="preserve-pixel-size"
            className="overflow-visible!"
          >
            <Pane>
              <DiffTree files={visibleFiles} />
            </Pane>
          </ResizablePanel>
          <ResizableHandle className="w-1.5" withHandle />
        </>
      )}

      <ResizablePanel minSize={300} id="content" className="overflow-visible!">
        <Pane>
          <DiffToolbar
            totalCount={files.length}
            viewedCount={viewedCount}
            visibleFiles={visibleFiles}
          />

          <DiffCodeView
            canAuthor={canAuthor}
            driftFor={driftFor}
            files={visibleFiles}
            viewed={viewed}
          />
        </Pane>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
