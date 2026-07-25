import { KbdHint } from "@client/components/kbd-hint";
import { Button } from "@client/components/ui/button";
import {
  Drawer,
  DrawerPopup,
  DrawerTrigger,
} from "@client/components/ui/drawer";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@client/components/ui/menu";
import { Separator } from "@client/components/ui/separator";
import { DismissProvider } from "@client/hooks/use-dismiss";
import { useKeyPressed } from "@client/hooks/use-key-pressed";
import { useIsMobile } from "@client/hooks/use-media-query";
import type { DiffFile } from "@client/lib/diff";
import { diffLayoutAtom, diffTreeOpenAtom } from "@client/lib/preferences";
import { useAtom } from "jotai/react";
import { ListTree, Settings } from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { ChangeRangePicker } from "./change-picker";
import { DiffTree } from "./tree";

const treeToggleButtonProps = {
  "aria-label": "Toggle file tree",
  size: "icon-sm",
  variant: "ghost",
} as const;

export function DiffToolbar({
  totalCount,
  viewedCount,
  visibleFiles,
}: {
  totalCount: number;
  viewedCount: number;
  visibleFiles: DiffFile[];
}) {
  const isMobile = useIsMobile();

  const [diffLayout, setDiffLayout] = useAtom(diffLayoutAtom);
  const [diffTreeOpen, setDiffTreeOpen] = useAtom(diffTreeOpenAtom);
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);

  const isAltPressed = useKeyPressed("Alt");
  useHotkeys("Alt + BracketLeft", () => setDiffTreeOpen(!diffTreeOpen));

  return (
    <div className="@container flex h-11 shrink-0 items-center gap-1.5 border-b px-2">
      {isMobile ? (
        <Drawer open={treeDrawerOpen} onOpenChange={setTreeDrawerOpen}>
          <DrawerTrigger render={<Button {...treeToggleButtonProps} />}>
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
          {...treeToggleButtonProps}
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
        <span className="truncate text-[13px] text-muted-foreground tabular-nums">
          {viewedCount} / {totalCount}{" "}
          <span className="@max-xs:sr-only">viewed</span>
        </span>
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Diff settings"
              />
            }
          >
            <Settings />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuGroup>
              <MenuGroupLabel>Layout</MenuGroupLabel>
              <MenuRadioGroup value={diffLayout} onValueChange={setDiffLayout}>
                <MenuRadioItem value="unified">Unified</MenuRadioItem>
                <MenuRadioItem value="split">Split</MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>
    </div>
  );
}
