import { Button } from "@client/components/ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@client/components/ui/menu";
import type { Status } from "@shared/lib/finding";
import { STATUS_LABEL, STATUSES } from "@shared/lib/finding";
import { useAtom } from "jotai/react";
import { MessagesSquare } from "lucide-react";
import plur from "plur";

import { useFindings } from "./hooks/use-findings";
import type { FindingSurface } from "./lib/filters";
import {
  DEFAULT_FILTERS,
  FINDING_SURFACES,
  findingFiltersAtom,
  isDefaultFilters,
  SURFACE_LABEL,
  toggleStatus,
  toggleSurface,
} from "./lib/filters";

/**
 * The panel's headline and its filter in one control, so the count names what
 * is being shown: narrowing the filter is answered by the number above the list
 * rather than leaving it claiming findings the reader can no longer see.
 */
export function FindingsFilter() {
  const { visible } = useFindings();
  const [filters, setFilters] = useAtom(findingFiltersAtom);

  const count = visible.length;

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="font-normal text-[13px]!"
          />
        }
      >
        <MessagesSquare />
        {count} {plur("comment", count)}
      </MenuTrigger>

      <MenuPopup align="start">
        <MenuGroup>
          <MenuGroupLabel>Status</MenuGroupLabel>

          {STATUSES.map((status: Status) => (
            <MenuCheckboxItem
              checked={filters.statuses.includes(status)}
              key={status}
              onCheckedChange={() =>
                setFilters((previous) => toggleStatus(previous, status))
              }
            >
              {STATUS_LABEL[status]}
            </MenuCheckboxItem>
          ))}
        </MenuGroup>

        <MenuSeparator />

        <MenuGroup>
          <MenuGroupLabel>Location</MenuGroupLabel>

          {FINDING_SURFACES.map((surface: FindingSurface) => (
            <MenuCheckboxItem
              checked={filters.surfaces.includes(surface)}
              key={surface}
              onCheckedChange={() =>
                setFilters((previous) => toggleSurface(previous, surface))
              }
            >
              {SURFACE_LABEL[surface]}
            </MenuCheckboxItem>
          ))}
        </MenuGroup>

        <MenuSeparator />

        <MenuItem
          disabled={isDefaultFilters(filters)}
          onClick={() => setFilters(DEFAULT_FILTERS)}
        >
          Reset filters
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
