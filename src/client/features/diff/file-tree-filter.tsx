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
  EMPTY_FILTERS,
  diffFiltersAtom,
  toggleStatusFilter,
} from "@client/features/diff/filters";
import type { GitStatus } from "@pierre/trees";
import { useAtom } from "jotai/react";
import { ListFilter } from "lucide-react";

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
      <MenuTrigger
        render={
          <Button variant="outline" size="icon-sm">
            <ListFilter />
          </Button>
        }
      />
      <MenuPopup align="end">
        <MenuGroup>
          <MenuGroupLabel>Filter files</MenuGroupLabel>
          <MenuCheckboxItem
            checked={filters.unviewed}
            onCheckedChange={(checked) =>
              setFilters((prev) => ({ ...prev, unviewed: checked }))
            }
          >
            Unviewed
          </MenuCheckboxItem>
          <MenuCheckboxItem
            checked={filters.findings}
            onCheckedChange={(checked) =>
              setFilters((prev) => ({ ...prev, findings: checked }))
            }
          >
            Findings
          </MenuCheckboxItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Git status</MenuGroupLabel>
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
            Clear filters
          </MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
