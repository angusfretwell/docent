import type { DiffFile } from "@client/lib/diff";
import { statusForChange } from "@client/lib/diff";
import { useRevealDiffItem } from "@client/lib/diff-target";
import { last } from "radashi";
import { useMemo } from "react";

import { FileTree } from "./file-tree";

export function DiffTree({ files }: { files: DiffFile[] }) {
  const revealDiffItem = useRevealDiffItem();

  const { gitStatus, paths } = useMemo(
    () => ({
      gitStatus: files.map((file) => ({
        path: file.path,
        status: statusForChange(file.file.type),
      })),
      paths: files.map((file) => file.path),
    }),
    [files]
  );

  function reveal(path: string | undefined) {
    if (!path) {
      return;
    }

    const file = files.find((entry) => entry.path === path);

    if (file === undefined) {
      return;
    }

    revealDiffItem(file.id);
  }

  return (
    <FileTree
      gitStatus={gitStatus}
      paths={paths}
      onFileClick={(path) => reveal(path)}
      onSelectionChange={(selectedPaths) => reveal(last(selectedPaths))}
    />
  );
}
