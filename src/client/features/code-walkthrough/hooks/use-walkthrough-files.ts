import { walkthroughPaths } from "@client/features/walkthrough/lib/walkthrough";
import { useExpandedFiles } from "@client/hooks/use-expanded-files";
import type { DiffFile } from "@client/lib/diff";
import { parsePatchFiles } from "@client/lib/diff";
import type { WalkthroughEntry } from "@shared/schemas/review";
import { useMemo } from "react";

/** The files a walkthrough points at, in the order it first reaches for them. */
export function useWalkthroughFiles(
  patch: string,
  sections: WalkthroughEntry["sections"]
): DiffFile[] {
  const referenced = useMemo(() => {
    const paths = walkthroughPaths(sections);
    const referenceRank = new Map(
      [...paths].map((path, index) => [path, index] as const)
    );

    return parsePatchFiles(patch)
      .filter((file) => paths.has(file.path))
      .toSorted(
        (left, right) =>
          (referenceRank.get(left.path) ?? 0) -
          (referenceRank.get(right.path) ?? 0)
      );
  }, [patch, sections]);

  return useExpandedFiles(referenced);
}
