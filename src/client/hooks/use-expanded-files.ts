import type { DiffFile } from "@client/lib/diff";
import { expansionBlobs, withBlobContents } from "@client/lib/diff";
import { blobQueryOptions } from "@client/queries/blob";
import type { UseQueryResult } from "@tanstack/react-query";
import { useQueries } from "@tanstack/react-query";
import { select, unique, zip } from "radashi";
import { useMemo } from "react";

// Hoisted so `useQueries` can memoize it: an inline `combine` re-runs every render.
function blobTexts(
  results: readonly UseQueryResult<string>[]
): (string | undefined)[] {
  return results.map((result) => result.data);
}

/**
 * Diff files re-parsed against both blobs, so the reader can expand the
 * unchanged lines the patch left out. Files stay partial until their blobs
 * arrive.
 *
 * @param blobsAvailable False for the Pending diff, which runs against the
 * working tree: its head side has a content sha for an object git never wrote
 * to the object database, so there is nothing to fetch and it stays partial.
 */
export function useExpandedFiles(
  files: DiffFile[],
  blobsAvailable = true
): DiffFile[] {
  const shas = useMemo(
    () =>
      blobsAvailable
        ? unique(files.flatMap((file) => expansionBlobs(file) ?? []))
        : [],
    [blobsAvailable, files]
  );

  const texts = useQueries({
    combine: blobTexts,
    queries: shas.map(blobQueryOptions),
  });

  return useMemo(() => {
    const contents = new Map(
      select(zip(shas, texts), ([sha, text]) =>
        text === undefined ? undefined : ([sha, text] as const)
      )
    );

    return files.map((file) => withBlobContents(file, contents));
  }, [files, shas, texts]);
}
