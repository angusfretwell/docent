import { useCodeTheme } from "@client/hooks/use-code-theme";
import { themeToTreeStyles } from "@pierre/trees";
import type { GitStatusEntry } from "@pierre/trees";
import { FileTree as BaseFileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useRef } from "react";

import { FileTreeFilter } from "./filter";
import { FileTreeSearch } from "./search";

const TREES_CSS = `
  [data-file-tree-virtualized-scroll] {
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
`;

const TREES_STYLES = {
  "--trees-padding-inline": 0,
  "--trees-scrollbar-thumb":
    "color-mix(in srgb, var(--color-foreground) 20%, transparent)",
  "--trees-theme-sidebar-bg": "var(--color-background)",
  backgroundColor: "var(--color-background)",
  paddingLeft: "6px",
};

export function FileTreeView({
  gitStatus,
  onFileClick,
  onSelectionChange,
  paths,
}: {
  gitStatus: GitStatusEntry[];
  /** Fires on every click, including re-clicks of the already-selected file. */
  onFileClick?: (path: string) => void;
  onSelectionChange?: (selectedPaths: readonly string[]) => void;
  paths: string[];
}) {
  const theme = useCodeTheme();

  const { model } = useFileTree({
    flattenEmptyDirectories: true,
    gitStatus,
    initialExpansion: "open",
    onSelectionChange,
    paths,
    stickyFolders: true,
    unsafeCSS: TREES_CSS,
  });

  // useFileTree builds the model once from its initial options; view switches
  // and file filters change `paths`/`gitStatus` afterwards, so sync them into
  // the model imperatively.
  const syncedRef = useRef({ gitStatus, paths });

  useEffect(() => {
    const synced = syncedRef.current;

    if (synced.paths !== paths) {
      model.resetPaths(paths);
    }
    if (synced.gitStatus !== gitStatus) {
      model.setGitStatus(gitStatus);
    }

    syncedRef.current = { gitStatus, paths };
  }, [gitStatus, model, paths]);

  // The tree only reports selection *changes*, so re-clicking the current file
  // is silent. Rows render into a shadow root, hence composedPath().
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || !onFileClick) {
      return;
    }

    function handleClick(event: MouseEvent) {
      const row = event
        .composedPath()
        .find(
          (target): target is HTMLElement =>
            target instanceof HTMLElement && target.dataset.itemType === "file"
        );

      if (row?.dataset.itemPath) {
        onFileClick?.(row.dataset.itemPath);
      }
    }

    container.addEventListener("click", handleClick);

    return () => container.removeEventListener("click", handleClick);
  }, [onFileClick]);

  const style = {
    ...themeToTreeStyles(theme),
    ...TREES_STYLES,
  } as React.CSSProperties;

  return (
    <div className="grow h-full flex flex-col" ref={containerRef}>
      <div className="flex items-center gap-1 p-2">
        <FileTreeSearch model={model} />
        <FileTreeFilter />
      </div>

      <BaseFileTree model={model} style={style} />
    </div>
  );
}
