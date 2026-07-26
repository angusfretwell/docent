import { useResetPanels } from "@client/hooks/use-panel-reset";
import { autoScrollAtom, diffLayoutAtom } from "@client/lib/preferences";
import { useAtom } from "jotai";
import { SettingsIcon } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";

import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "./ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

// option-c - toggle inline comments
// option-d - toggle color scheme
// option-l - toggle diff layout

export function Settings() {
  const [autoScroll, setAutoScroll] = useAtom(autoScrollAtom);
  const [diffLayout, setDiffLayout] = useAtom(diffLayoutAtom);
  const { theme, setTheme } = useTheme();

  const resetPanels = useResetPanels();

  useHotkeys("Alt+R", resetPanels);

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Settings" />
              }
            >
              <SettingsIcon />
            </MenuTrigger>
          }
        />
        <TooltipPopup>Settings</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end">
        <MenuGroup>
          <MenuGroupLabel>Color Scheme</MenuGroupLabel>
          <MenuRadioGroup value={theme} onValueChange={setTheme}>
            <MenuRadioItem value="system">System</MenuRadioItem>
            <MenuRadioItem value="light">Light</MenuRadioItem>
            <MenuRadioItem value="dark">Dark</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />

        <MenuCheckboxItem
          checked={autoScroll}
          onCheckedChange={setAutoScroll}
          variant="switch"
        >
          Auto-scroll
        </MenuCheckboxItem>
        <MenuSeparator />

        <MenuSub>
          <MenuSubTrigger>Diff</MenuSubTrigger>
          <MenuSubPopup>
            <MenuGroup>
              <MenuGroupLabel>Layout</MenuGroupLabel>
              <MenuRadioGroup value={diffLayout} onValueChange={setDiffLayout}>
                <MenuRadioItem value="unified">Unified</MenuRadioItem>
                <MenuRadioItem value="split">Split</MenuRadioItem>
              </MenuRadioGroup>
              <MenuSeparator />
              <MenuCheckboxItem defaultChecked variant="switch">
                Inline Comments
              </MenuCheckboxItem>
            </MenuGroup>
          </MenuSubPopup>
        </MenuSub>

        {/* <MenuGroup>
          <MenuGroupLabel>Diff layout</MenuGroupLabel>
          <MenuRadioGroup value={diffLayout} onValueChange={setDiffLayout}>
            <MenuRadioItem value="unified">Unified</MenuRadioItem>
            <MenuRadioItem value="split">Split</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Color scheme</MenuGroupLabel>
          <MenuRadioGroup>
            <MenuRadioItem value="system">System</MenuRadioItem>
            <MenuRadioItem value="light">Light</MenuRadioItem>
            <MenuRadioItem value="dark">Dark</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup> */}
        <MenuSeparator />
        <MenuGroup>
          <MenuItem onClick={resetPanels}>
            Reset Panels
            <MenuShortcut>⌥R</MenuShortcut>
          </MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
