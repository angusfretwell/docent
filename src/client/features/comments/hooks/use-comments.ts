import { useDrift } from "@client/hooks/use-drift";
import { sectionKey } from "@client/lib/comment-sections";
import { parsePatchFiles } from "@client/lib/diff";
import type { DiffTarget } from "@client/lib/diff-target";
import { anchorDiffTarget } from "@client/lib/diff-target";
import { diffQueryOptions } from "@client/queries/diff";
import { reviewQueryOptions } from "@client/queries/review";
import { ANCHOR_KIND } from "@shared/enums/anchor-kind";
import type { DriftState } from "@shared/enums/drift-state";
import { WalkthroughKind } from "@shared/enums/walkthrough-kind";
import { commentLocation, foldComment } from "@shared/lib/comment";
import type { FoldedComment } from "@shared/lib/comment";
import {
  latestCodeWalkthrough,
  latestProductWalkthrough,
} from "@shared/lib/identity-drift";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai/react";
import { useMemo } from "react";

import type { CommentSurface } from "../lib/filters";
import { commentFiltersAtom, matchesCommentFilters } from "../lib/filters";
import { orderComments } from "../lib/order";
import type { CommentSection } from "../lib/types";
import { useCommentSurface } from "./use-comment-surface";

export interface CommentListItem {
  comment: FoldedComment;
  diffTarget?: DiffTarget;
  drift?: DriftState;
  location: string;
  section?: CommentSection;
  surface?: CommentSurface;
}

export function useComments(): { visible: CommentListItem[] } {
  const { data: review } = useSuspenseQuery(reviewQueryOptions);
  const { data: change } = useSuspenseQuery(diffQueryOptions);
  const filters = useAtomValue(commentFiltersAtom);
  const surface = useCommentSurface();

  const { comments } = review;
  const { patch } = change;
  const { walkthroughs } = review;
  const reviewTitle = review.review.title;

  const drift = useDrift({
    comments: review.comments,
    patch,
    walkthroughs: review.walkthroughs,
  });

  const files = useMemo(() => parsePatchFiles(patch), [patch]);
  const anchorFileById = useMemo(
    () => new Map(comments.map((entry) => [entry.id, entry.anchorFile])),
    [comments]
  );

  const list = useMemo(() => {
    const entries = comments;

    const sectionTitles = new Map(
      walkthroughs.flatMap((walkthrough) =>
        walkthrough.sections.map(
          (section) =>
            [sectionKey(walkthrough.id, section.id), section.title] as const
        )
      )
    );

    // Only tours the pillars still render can be jumped into, so reachable
    // sections come from those, not from every walkthrough the Review has held.
    const shownTours = [
      {
        pillar: WalkthroughKind.Code,
        walkthrough: latestCodeWalkthrough(walkthroughs),
      },
      {
        pillar: WalkthroughKind.Product,
        walkthrough: latestProductWalkthrough(walkthroughs),
      },
    ] as const;
    const sectionPillars = new Map(
      shownTours.flatMap(({ pillar, walkthrough }) =>
        (walkthrough?.sections ?? []).map(
          (section) =>
            [sectionKey(walkthrough?.id ?? "", section.id), pillar] as const
        )
      )
    );

    // Every tour's pillar, superseded ones included: a comment on an old tour is
    // still about that pillar, so it belongs in that filter with nowhere to jump.
    const pillarByTour = new Map(
      walkthroughs.map(
        (walkthrough) => [walkthrough.id, walkthrough.kind] as const
      )
    );

    function locationOf(comment: FoldedComment): string {
      const { anchor } = comment;

      // A comment on no particular part of the change reads as the Review;
      // "Whole change" only where the Review has yet to be named.
      if (anchor?.kind === ANCHOR_KIND.change && reviewTitle !== "") {
        return reviewTitle;
      }

      if (anchor?.kind !== ANCHOR_KIND.walkthroughSection) {
        return commentLocation(anchor);
      }

      const title = sectionTitles.get(
        sectionKey(anchor.walkthroughId, anchor.sectionId)
      );

      return title ?? anchor.sectionId;
    }

    function sectionOf(comment: FoldedComment): CommentSection | undefined {
      const { anchor } = comment;

      if (anchor?.kind !== ANCHOR_KIND.walkthroughSection) {
        return undefined;
      }

      const key = sectionKey(anchor.walkthroughId, anchor.sectionId);
      const pillar = sectionPillars.get(key);

      return pillar === undefined ? undefined : { key, pillar };
    }

    function surfaceOf(comment: FoldedComment): CommentSurface | undefined {
      const { anchor } = comment;

      if (anchor === undefined) {
        return undefined;
      }

      switch (anchor.kind) {
        case ANCHOR_KIND.line:
        case ANCHOR_KIND.file:
        case ANCHOR_KIND.change: {
          return "diff";
        }
        case ANCHOR_KIND.walkthroughSection: {
          return pillarByTour.get(anchor.walkthroughId);
        }
        case ANCHOR_KIND.screenshotRegion:
        case ANCHOR_KIND.recordingTimestamp: {
          return "product";
        }
        default: {
          return undefined;
        }
      }
    }

    const matching = entries
      .map((entry) => foldComment(entry.id, entry.records))
      .map((comment) => ({
        comment,
        location: locationOf(comment),
        section: sectionOf(comment),
        surface: surfaceOf(comment),
      }))
      .filter((entry) =>
        matchesCommentFilters(filters, {
          status: entry.comment.status,
          surface: entry.surface,
        })
      );

    return { visible: orderComments(matching, surface) };
  }, [filters, comments, reviewTitle, surface, walkthroughs]);

  // Drift resolves asynchronously and hands back a fresh map each render, so it
  // and the diff target it places are attached outside the memo — keeping the
  // fold/sort above it stable.
  const visible = list.visible.map((entry) => {
    const result = drift.get(entry.comment.id);
    const diffTarget = anchorDiffTarget({
      anchor: entry.comment.anchor,
      anchorFile: anchorFileById.get(entry.comment.id),
      drift: result,
      files,
    });

    return {
      ...entry,
      ...(diffTarget === undefined ? {} : { diffTarget }),
      ...(result === undefined ? {} : { drift: result.state }),
    };
  });

  return { visible };
}
