import {
  diffFiltersAtom,
  matchesFilters,
} from "@client/features/file-tree/lib/filters";
import { useDrift } from "@client/hooks/use-drift";
import { useExpandedFiles } from "@client/hooks/use-expanded-files";
import { parsePatchFiles, statusForChange } from "@client/lib/diff";
import { diffQueryOptions } from "@client/queries/diff";
import { pendingQueryOptions } from "@client/queries/pending";
import { reviewQueryOptions } from "@client/queries/review";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useAtomValue } from "jotai/react";
import { useMemo } from "react";

import { isGeneratedPath } from "../lib/generated";
import { computeViewed } from "../lib/viewed";
import { useCollapsedState } from "./use-collapsed";
import { useViewedState } from "./use-viewed";

export function useDiffView() {
  const { data: change } = useSuspenseQuery(diffQueryOptions);
  const { range, view } = useSearch({ from: "/" });
  const { data: pending } = useSuspenseQuery(pendingQueryOptions(range));
  const { data: review } = useSuspenseQuery(reviewQueryOptions);

  // Pending is only renderable while the working tree is dirty; a stale
  // `view=pending` URL renders the branch diff instead.
  const showPending = view === "pending" && pending.dirty;

  const patch = showPending ? pending.patch : change.patch;

  // Drift is defined against the current Change (data-model.md §6), so it reads
  // off the branch patch even in the Pending preview.
  const drift = useDrift({
    comments: review.comments,
    patch: change.patch,
    walkthroughs: review.walkthroughs,
  });

  const parsed = useMemo(() => parsePatchFiles(patch), [patch]);
  const files = useExpandedFiles(parsed, !showPending);
  const fileById = useMemo(
    () => new Map(files.map((file) => [file.id, file])),
    [files]
  );

  const generatedPaths = useMemo(
    () => new Set(change.generated),
    [change.generated]
  );
  const viewedModel = useMemo(
    () =>
      computeViewed(
        review.viewed,
        files,
        (file) =>
          file.file.type === "rename-pure" ||
          generatedPaths.has(file.path) ||
          isGeneratedPath(file.path)
      ),
    [files, generatedPaths, review]
  );
  const viewed = useViewedState(fileById, viewedModel);

  const filters = useAtomValue(diffFiltersAtom);
  const commentPaths = useMemo(
    () =>
      new Set(
        review.comments.flatMap((comment) =>
          comment.anchorFile === undefined ? [] : [comment.anchorFile]
        )
      ),
    [review]
  );

  const visibleFiles = files.filter((file) =>
    matchesFilters(filters, {
      hasComment: commentPaths.has(file.path),
      status: statusForChange(file.file.type),
      viewed: viewed.isViewed(file.id),
    })
  );

  const viewedCount = files.filter((file) => viewed.isViewed(file.id)).length;

  const collapsed = useCollapsedState(visibleFiles, viewed);

  return {
    canAuthor: !showPending,
    collapsed,
    driftFor: showPending ? undefined : (id: string) => drift.get(id),
    files,
    viewed,
    viewedCount,
    visibleFiles,
  };
}
