import { Button } from "@client/components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuTrigger,
  MenuPopup,
  MenuGroupLabel,
  MenuSeparator,
  MenuCheckboxItem,
  MenuItem,
} from "@client/components/ui/menu";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@client/components/ui/tooltip";
import type { GitStatus } from "@pierre/trees";
import { useAtom } from "jotai/react";
import { ListFilter } from "lucide-react";

import {
  diffFiltersAtom,
  EMPTY_FILTERS,
  toggleStatusFilter,
} from "./lib/filters";

const STATUS_FILTERS: { label: string; status: GitStatus }[] = [
  { label: "Added", status: "added" },
  { label: "Modified", status: "modified" },
  { label: "Renamed", status: "renamed" },
  { label: "Deleted", status: "deleted" },
];

export function FileTreeFilter() {
  const [filters, setFilters] = useAtom(diffFiltersAtom);

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Filter files"
                >
                  <ListFilter />
                </Button>
              }
            />
          }
        />
        <TooltipPopup>Filter files</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end">
        <MenuGroup>
          <MenuGroupLabel>Filter</MenuGroupLabel>
          <MenuCheckboxItem
            checked={filters.unviewed}
            onCheckedChange={(checked) =>
              setFilters((prev) => ({ ...prev, unviewed: checked }))
            }
          >
            Unviewed
          </MenuCheckboxItem>
          <MenuCheckboxItem
            checked={filters.comments}
            onCheckedChange={(checked) =>
              setFilters((prev) => ({ ...prev, comments: checked }))
            }
          >
            Comments
          </MenuCheckboxItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Status</MenuGroupLabel>
          {STATUS_FILTERS.map(({ label, status }) => (
            <MenuCheckboxItem
              checked={filters.statuses.has(status)}
              key={status}
              onCheckedChange={() =>
                setFilters((prev) => toggleStatusFilter(prev, status))
              }
            >
              {label}
            </MenuCheckboxItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuItem
            onClick={() => setFilters(EMPTY_FILTERS)}
            disabled={filters === EMPTY_FILTERS}
          >
            Clear Filters
          </MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
