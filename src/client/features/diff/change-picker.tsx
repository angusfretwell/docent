import { Button } from "@client/components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@client/components/ui/menu";
import { pendingQueryOptions } from "@client/queries/pending";
import type { PendingRange } from "@shared/enums/pending-range";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { GalleryHorizontalEnd } from "lucide-react";

export function ChangeRangePicker() {
  const navigate = useNavigate();
  const { range, view } = useSearch({ from: "/" });
  const { data: pending } = useSuspenseQuery(pendingQueryOptions(range));

  const { dirty } = pending;
  // A `view=pending` URL while the tree is clean renders the branch diff, so the
  // selection follows what actually renders.
  const activeView = view === "pending" && dirty ? "pending" : "change";

  function setView(next: "change" | "pending") {
    void navigate({
      search: (prev) => ({ ...prev, view: next }),
      to: "/",
    });
  }

  function setRange(next: PendingRange) {
    void navigate({
      search: (prev) => ({ ...prev, range: next }),
      to: "/",
    });
  }

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            className="text-[13px]! font-normal"
            size="sm"
            variant="ghost"
          />
        }
      >
        <GalleryHorizontalEnd />
        <span className="@max-xs:sr-only">
          {activeView === "pending" ? "Pending changes" : "All commits"}
        </span>
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuGroup>
          <MenuGroupLabel>Change</MenuGroupLabel>
          <MenuRadioGroup value={activeView} onValueChange={setView}>
            <MenuRadioItem value="pending" disabled={!dirty}>
              Pending changes
            </MenuRadioItem>
            <MenuRadioItem value="change">All commits</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Mode</MenuGroupLabel>
          <MenuRadioGroup value={range} onValueChange={setRange}>
            <MenuRadioItem
              value="cumulative"
              disabled={activeView !== "pending"}
            >
              Cumulative
            </MenuRadioItem>
            <MenuRadioItem
              value="incremental"
              disabled={activeView !== "pending"}
            >
              Standalone
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
