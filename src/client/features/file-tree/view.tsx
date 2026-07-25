import { useCodeTheme } from "@client/hooks/use-code-theme";
import { themeToTreeStyles } from "@pierre/trees";
import type { GitStatusEntry } from "@pierre/trees";
import { FileTree as BaseFileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useRef } from "react";

import { FileTreeFilter } from "./filter";
import { FileTreeSearch } from "./search";

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
  });

  // useFileTree builds the model once from its initial options, so later
  // `paths`/`gitStatus` changes must be synced into it imperatively.
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

  const style = themeToTreeStyles({
    ...theme,
    colors: {
      ...theme.colors,
      "sideBar.background": "var(--color-background)",
    },
  });

  return (
    <div className="flex h-full grow flex-col" ref={containerRef}>
      <div className="flex items-center gap-1 p-2">
        <FileTreeSearch model={model} />
        <FileTreeFilter />
      </div>

      <BaseFileTree
        model={model}
        style={style}
        className="overscroll-contain pl-1.5"
      />
    </div>
  );
}
