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
import { commentStatuses, STATUS_LABEL } from "@shared/enums/comment-status";
import type { CommentStatus } from "@shared/enums/comment-status";
import { useAtom } from "jotai/react";
import { MessagesSquare } from "lucide-react";
import plur from "plur";

import { useComments } from "./hooks/use-comments";
import type { CommentSurface } from "./lib/filters";
import {
  DEFAULT_FILTERS,
  COMMENT_SURFACES,
  commentFiltersAtom,
  isDefaultFilters,
  SURFACE_LABEL,
  toggleStatus,
  toggleSurface,
} from "./lib/filters";

export function CommentsFilter() {
  const { visible } = useComments();
  const [filters, setFilters] = useAtom(commentFiltersAtom);

  const count = visible.length;

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
        <MessagesSquare />
        {count} {plur("comment", count)}
      </MenuTrigger>

      <MenuPopup align="start">
        <MenuGroup>
          <MenuGroupLabel>Status</MenuGroupLabel>

          {commentStatuses.map((status: CommentStatus) => (
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

          {COMMENT_SURFACES.map((surface: CommentSurface) => (
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
