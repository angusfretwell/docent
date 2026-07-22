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
import { pendingQueryOptions } from "@client/features/diff/pending";
import type { PendingRange } from "@shared/schemas/pending";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { GalleryHorizontalEnd } from "lucide-react";

export function DiffFilter() {
  const navigate = useNavigate();
  const { range, view } = useSearch({ from: "/" });
  const { data: pending } = useQuery(pendingQueryOptions(range));

  const dirty = pending?.dirty ?? false;
  // A `view=pending` URL while the working tree is clean silently renders the
  // branch diff, so the selection shown here follows what actually renders.
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
            variant="ghost"
            size="sm"
            className="font-normal text-[13px]!"
          >
            <GalleryHorizontalEnd />
            {activeView === "pending" ? "Pending changes" : "All commits"}
          </Button>
        }
      />
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
