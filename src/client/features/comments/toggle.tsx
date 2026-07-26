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
import { Sheet, SheetPopup } from "@client/components/ui/sheet";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@client/components/ui/tooltip";
import { DismissProvider } from "@client/hooks/use-dismiss";
import { useKeyPressed } from "@client/hooks/use-key-pressed";
import { useMediaQuery } from "@client/hooks/use-media-query";
import { commentsOpenAtom } from "@client/lib/preferences";
import { useAtom } from "jotai/react";
import { MessagesSquare, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { CommentsPanel } from "./panel";

export function CommentsToggle() {
  const [commentsOpen, setCommentsOpen] = useAtom(commentsOpenAtom);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isMobile = useMediaQuery("max-sm");
  const isSmallScreen = useMediaQuery("max-md");

  const isAltPressed = useKeyPressed("Alt");

  useHotkeys("Alt + BracketRight", () => setCommentsOpen(!commentsOpen));

  if (isMobile) {
    return (
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerTrigger
          render={
            <Button aria-label="Open comments" variant="ghost" size="icon" />
          }
        >
          <MessagesSquare />
        </DrawerTrigger>
        <DrawerPopup showBar>
          <DismissProvider dismiss={() => setDrawerOpen(false)}>
            <CommentsPanel />
          </DismissProvider>
        </DrawerPopup>
      </Drawer>
    );
  }

  if (isSmallScreen) {
    return (
      <Popover>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <PopoverTrigger
            delay={200}
            closeDelay={600}
            openOnHover={true}
            onClick={(event) => {
              event.preventBaseUIHandler();
              setDrawerOpen(true);
            }}
            render={
              <Button aria-label="Open comments" variant="ghost" size="icon" />
            }
          >
            <MessagesSquare />
          </PopoverTrigger>
          <SheetPopup showCloseButton={false} variant="inset">
            <DismissProvider dismiss={() => setDrawerOpen(false)}>
              <CommentsPanel />
            </DismissProvider>
          </SheetPopup>
        </Sheet>
        <PopoverPopup className="*:data-[slot=popover-viewport]:overflow-initial max-w-md overflow-clip *:data-[slot=popover-viewport]:p-0">
          <CommentsPanel popover />
        </PopoverPopup>
      </Popover>
    );
  }

  if (!commentsOpen) {
    return (
      <Popover>
        <PopoverTrigger
          delay={200}
          closeDelay={600}
          openOnHover={true}
          render={
            <Button
              aria-label="Open comments"
              variant="ghost"
              size="icon"
              onClick={() => setCommentsOpen(true)}
            >
              <KbdHint active={isAltPressed} shortcut="]">
                <PanelRightOpen />
              </KbdHint>
            </Button>
          }
        />
        <PopoverPopup className="*:data-[slot=popover-viewport]:overflow-initial max-w-md overflow-clip *:data-[slot=popover-viewport]:p-0">
          <CommentsPanel popover />
        </PopoverPopup>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Hide comments"
            variant="ghost"
            size="icon"
            onClick={() => setCommentsOpen(false)}
          >
            <KbdHint active={isAltPressed} shortcut="]">
              <PanelRightClose />
            </KbdHint>
          </Button>
        }
      />
      <TooltipPopup>Hide comments</TooltipPopup>
    </Tooltip>
  );
}
