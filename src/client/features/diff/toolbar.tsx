import { KbdHint } from "@client/components/kbd-hint";
import { Button } from "@client/components/ui/button";
import {
  Drawer,
  DrawerPopup,
  DrawerTrigger,
} from "@client/components/ui/drawer";
import { Separator } from "@client/components/ui/separator";
import { DismissProvider } from "@client/hooks/use-dismiss";
import { useKeyPressed } from "@client/hooks/use-key-pressed";
import { useIsMobile } from "@client/hooks/use-media-query";
import type { DiffFile } from "@client/lib/diff";
import { diffTreeOpenAtom } from "@client/lib/preferences";
import { useAtom } from "jotai/react";
import { FoldVertical, ListTree, UnfoldVertical } from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { ChangeRangePicker } from "./change-picker";
import type { Collapsed } from "./hooks/use-collapsed";
import { DiffTree } from "./tree";

export function DiffToolbar({
  collapsed,
  totalCount,
  viewedCount,
  visibleFiles,
}: {
  collapsed: Collapsed;
  totalCount: number;
  viewedCount: number;
  visibleFiles: DiffFile[];
}) {
  const isMobile = useIsMobile();

  const [diffTreeOpen, setDiffTreeOpen] = useAtom(diffTreeOpenAtom);
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);

  const isAltPressed = useKeyPressed("Alt");
  useHotkeys("Alt + BracketLeft", () => setDiffTreeOpen(!diffTreeOpen));

  return (
    <div className="@container flex h-11 shrink-0 items-center gap-1.5 border-b px-2">
      {isMobile ? (
        <Drawer open={treeDrawerOpen} onOpenChange={setTreeDrawerOpen}>
          <DrawerTrigger
            render={
              <Button
                aria-label="Toggle file tree"
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <ListTree />
          </DrawerTrigger>
          <DrawerPopup showBar>
            <div className="relative h-svh py-2">
              <DismissProvider dismiss={() => setTreeDrawerOpen(false)}>
                <DiffTree files={visibleFiles} />
              </DismissProvider>
            </div>
          </DrawerPopup>
        </Drawer>
      ) : (
        <Button
          aria-label="Toggle file tree"
          size="icon-sm"
          variant="ghost"
          onClick={() => setDiffTreeOpen(!diffTreeOpen)}
        >
          <KbdHint active={isAltPressed} shortcut="[">
            <ListTree />
          </KbdHint>
        </Button>
      )}
      <Separator orientation="vertical" className="h-4" />
      <ChangeRangePicker />
      <div className="ml-auto flex items-center gap-2">
        <p className="truncate text-[13px] text-muted-foreground tabular-nums">
          {viewedCount}&thinsp;/&thinsp;{totalCount}{" "}
          <span className="@max-xs:sr-only">viewed</span>
        </p>

        <Button
          aria-label={
            collapsed.allCollapsed ? "Expand all files" : "Collapse all files"
          }
          disabled={visibleFiles.length === 0}
          onClick={() => collapsed.toggleAll()}
          size="icon-sm"
          variant="ghost"
        >
          {collapsed.allCollapsed ? <UnfoldVertical /> : <FoldVertical />}
        </Button>
      </div>
    </div>
  );
}
