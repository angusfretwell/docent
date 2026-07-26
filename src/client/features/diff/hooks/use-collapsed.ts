import type { DiffFile } from "@client/lib/diff";
import { useState } from "react";

import type { Viewed } from "./use-viewed";

export interface Collapsed {
  allCollapsed: boolean;
  isCollapsed: (id: string) => boolean;
  setCollapsed: (id: string, collapsed: boolean) => void;
  toggleAll: () => void;
}

/**
 * Explicit collapse choices override the default, which follows viewed state: a
 * viewed file starts collapsed. Files the filters hide keep their override — a
 * fold-all is about what's on screen, not a decision about the rest.
 */
export function useCollapsedState(
  files: DiffFile[],
  viewed: Viewed
): Collapsed {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(
    new Map()
  );

  function isCollapsed(id: string): boolean {
    return overrides.get(id) ?? viewed.isViewed(id);
  }

  function setCollapsed(id: string, collapsed: boolean) {
    setOverrides((previous) => new Map(previous).set(id, collapsed));
  }

  const allCollapsed =
    files.length > 0 && files.every((file) => isCollapsed(file.id));

  function toggleAll() {
    const next = !allCollapsed;

    setOverrides((previous) => {
      const merged = new Map(previous);

      for (const file of files) {
        merged.set(file.id, next);
      }

      return merged;
    });
  }

  return { allCollapsed, isCollapsed, setCollapsed, toggleAll };
}
