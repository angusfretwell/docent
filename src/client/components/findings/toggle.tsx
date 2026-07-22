import { Button } from "@client/components/ui/button";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@client/components/ui/popover";
import { useKeyPressed } from "@client/hooks/use-key-pressed";
import { findingsOpenAtom } from "@client/lib/preferences";
import { useAtom } from "jotai/react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";

import { KbdHint } from "../kbd-hint";
import { FindingsPanel } from "./panel";

export function FindingsToggle() {
  const [findingsOpen, setFindingsOpen] = useAtom(findingsOpenAtom);

  const isAltPressed = useKeyPressed("Alt");

  useHotkeys("Alt + BracketRight", () => setFindingsOpen(!findingsOpen));

  if (!findingsOpen) {
    return (
      <Popover>
        <PopoverTrigger
          delay={200}
          closeDelay={600}
          openOnHover={true}
          render={
            <Button
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
    <Button variant="ghost" size="icon" onClick={() => setFindingsOpen(false)}>
      <KbdHint active={isAltPressed} shortcut="]">
        <PanelRightClose />
      </KbdHint>
    </Button>
  );
}
