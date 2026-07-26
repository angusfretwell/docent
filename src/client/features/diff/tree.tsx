import { FileTreeView } from "@client/features/file-tree/view";
import { useDismiss } from "@client/hooks/use-dismiss";
import type { DiffFile } from "@client/lib/diff";
import { statusForChange } from "@client/lib/diff";
import { useRevealDiffTarget } from "@client/lib/diff-target";
import { last } from "radashi";
import { useMemo } from "react";

export function DiffTree({ files }: { files: DiffFile[] }) {
  const revealDiffTarget = useRevealDiffTarget();
  const dismiss = useDismiss();

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

    revealDiffTarget({ id: file.id });
    dismiss();
  }

  return (
    <FileTreeView
      gitStatus={gitStatus}
      paths={paths}
      onFileClick={(path) => reveal(path)}
      onSelectionChange={(selectedPaths) => reveal(last(selectedPaths))}
    />
  );
}
