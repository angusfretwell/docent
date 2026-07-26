import { useLocation } from "@tanstack/react-router";

import type { CommentSurface } from "../lib/filters";

const SURFACE_BY_PATHNAME: Record<string, CommentSurface> = {
  "/": "diff",
  "/code": "code",
  "/product": "product",
};

export function useCommentSurface(): CommentSurface | undefined {
  return useLocation({
    select: (location) => SURFACE_BY_PATHNAME[location.pathname],
  });
}
