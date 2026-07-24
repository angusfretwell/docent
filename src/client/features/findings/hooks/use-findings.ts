import { useDrift } from "@client/hooks/use-drift";
import { parsePatchFiles } from "@client/lib/diff";
import { sectionKey } from "@client/lib/finding-sections";
import { diffQueryOptions } from "@client/queries/diff";
import { reviewQueryOptions } from "@client/queries/review";
import { ANCHOR_KIND } from "@shared/enums/anchor-kind";
import type { DriftState } from "@shared/enums/drift-state";
import { WalkthroughKind } from "@shared/enums/walkthrough-kind";
import {
  findingLocation,
  foldFinding,
  sortFoldedFindings,
} from "@shared/lib/finding";
import type { FoldedFinding } from "@shared/lib/finding";
import {
  latestCodeWalkthrough,
  latestProductWalkthrough,
} from "@shared/lib/identity-drift";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai/react";
import { useMemo } from "react";

import type { FindingSurface } from "../lib/filters";
import { findingFiltersAtom, matchesFindingFilters } from "../lib/filters";
import type { FindingSection } from "../lib/types";

export interface FindingListItem {
  finding: FoldedFinding;
  diffItemId?: string;
  drift?: DriftState;
  location: string;
  section?: FindingSection;
  surface?: FindingSurface;
}

export function useFindings(): { visible: FindingListItem[] } {
  const { data: review } = useSuspenseQuery(reviewQueryOptions);
  const { data: change } = useSuspenseQuery(diffQueryOptions);
  const filters = useAtomValue(findingFiltersAtom);

  const { findings } = review;
  const { patch } = change;
  const { walkthroughs } = review;
  const reviewTitle = review.review.title;

  const drift = useDrift({
    findings: review.findings,
    patch,
    walkthroughs: review.walkthroughs,
  });

  const list = useMemo(() => {
    const entries = findings;

    const anchorFileById = new Map(
      entries.map((entry) => [entry.id, entry.anchorFile])
    );
    const itemIdByPath = new Map(
      parsePatchFiles(patch).map((file) => [file.path, file.id])
    );
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

    // Every tour's pillar, superseded ones included: a finding on an old tour is
    // still about that pillar, so it belongs in that filter with nowhere to jump.
    const pillarByTour = new Map(
      walkthroughs.map(
        (walkthrough) => [walkthrough.id, walkthrough.kind] as const
      )
    );

    function locationOf(finding: FoldedFinding): string {
      const { anchor } = finding;

      // A finding on no particular part of the change reads as the Review;
      // "Whole change" only where the Review has yet to be named.
      if (anchor?.kind === ANCHOR_KIND.change && reviewTitle !== "") {
        return reviewTitle;
      }

      if (anchor?.kind !== ANCHOR_KIND.walkthroughSection) {
        return findingLocation(anchor);
      }

      const title = sectionTitles.get(
        sectionKey(anchor.walkthroughId, anchor.sectionId)
      );

      return title ?? anchor.sectionId;
    }

    function sectionOf(finding: FoldedFinding): FindingSection | undefined {
      const { anchor } = finding;

      if (anchor?.kind !== ANCHOR_KIND.walkthroughSection) {
        return undefined;
      }

      const key = sectionKey(anchor.walkthroughId, anchor.sectionId);
      const pillar = sectionPillars.get(key);

      return pillar === undefined ? undefined : { key, pillar };
    }

    function surfaceOf(finding: FoldedFinding): FindingSurface | undefined {
      const { anchor } = finding;

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

    const folded = sortFoldedFindings(
      entries.map((entry) => foldFinding(entry.id, entry.records))
    );

    const visible = folded
      .map((finding) => {
        const anchorFile = anchorFileById.get(finding.id);

        return {
          diffItemId:
            anchorFile === undefined ? undefined : itemIdByPath.get(anchorFile),
          finding,
          location: locationOf(finding),
          section: sectionOf(finding),
          surface: surfaceOf(finding),
        };
      })
      .filter((entry) =>
        matchesFindingFilters(filters, {
          status: entry.finding.status,
          surface: entry.surface,
        })
      );

    return { visible };
  }, [filters, findings, patch, reviewTitle, walkthroughs]);

  // Drift resolves asynchronously and hands back a fresh map each render, so it
  // is attached outside the memo — keeping the fold/sort above it stable.
  const visible = list.visible.map((entry) => {
    const state = drift.get(entry.finding.id)?.state;

    return state === undefined ? entry : { ...entry, drift: state };
  });

  return { visible };
}
