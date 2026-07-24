import { KbdHint } from "@client/components/kbd-hint";
import { Button } from "@client/components/ui/button";
import {
  Drawer,
  DrawerPopup,
  DrawerTrigger,
} from "@client/components/ui/drawer";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@client/components/ui/popover";
import { DrawerDismissProvider } from "@client/hooks/use-drawer-dismiss";
import { useKeyPressed } from "@client/hooks/use-key-pressed";
import { useMediaQuery } from "@client/hooks/use-media-query";
import { findingsOpenAtom } from "@client/lib/preferences";
import { useAtom } from "jotai/react";
import { MessagesSquare, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { FindingsPanel } from "./panel";

export function FindingsToggle() {
  const [findingsOpen, setFindingsOpen] = useAtom(findingsOpenAtom);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isMobile = useMediaQuery("max-md");

  const isAltPressed = useKeyPressed("Alt");

  useHotkeys("Alt + BracketRight", () => setFindingsOpen(!findingsOpen));

  if (isMobile) {
    return (
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerTrigger
          render={
            <Button aria-label="Open findings" variant="ghost" size="icon" />
          }
        >
          <MessagesSquare />
        </DrawerTrigger>
        <DrawerPopup showBar>
          <DrawerDismissProvider dismiss={() => setDrawerOpen(false)}>
            <FindingsPanel />
          </DrawerDismissProvider>
        </DrawerPopup>
      </Drawer>
    );
  }

  if (!findingsOpen) {
    return (
      <Popover>
        <PopoverTrigger
          delay={200}
          closeDelay={600}
          openOnHover={true}
          render={
            <Button
              aria-label="Open findings"
              variant="ghost"
              size="icon"
              onClick={() => setFindingsOpen(true)}
            >
              <KbdHint active={isAltPressed} shortcut="]">
                <PanelRightOpen />
              </KbdHint>
            </Button>
          }
        />
        <PopoverPopup className="*:data-[slot=popover-viewport]:p-0 w-[350px] *:data-[slot=popover-viewport]:overflow-initial overflow-clip">
          <FindingsPanel popover />
        </PopoverPopup>
      </Popover>
    );
  }

  return (
    <Button
      aria-label="Close findings"
      variant="ghost"
      size="icon"
      onClick={() => setFindingsOpen(false)}
    >
      <KbdHint active={isAltPressed} shortcut="]">
        <PanelRightClose />
      </KbdHint>
    </Button>
  );
}
