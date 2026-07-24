/**
 * The Findings panel's read model: folds each Finding's append-only records
 * into the render shape (shared derivation with the CLI and server), sorts by
 * location, applies the panel's filters, and resolves each anchor to the diff
 * item or tour step it can jump to. One hook behind every findings surface —
 * panel, filter label, and collapsed-toggle popover.
 */

import { parsePatchFiles } from "@client/lib/diff";
import { useDrift } from "@client/lib/drift";
import { sectionKey } from "@client/lib/finding-sections";
import { diffQueryOptions } from "@client/queries/diff";
import { reviewQueryOptions } from "@client/queries/review";
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
import type { DriftState } from "@shared/schemas/drift";
import { ANCHOR_KIND } from "@shared/schemas/finding";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai/react";
import { useMemo } from "react";

import type { FindingSurface } from "../lib/filters";
import { findingFiltersAtom, matchesFindingFilters } from "../lib/filters";
import type { FindingSection } from "../lib/types";

export interface FindingListItem {
  finding: FoldedFinding;
  /** The diff item the finding's anchor file maps to, when it is in the branch diff. */
  diffItemId?: string;
  /** The anchor's standing against the current Change; absent until drift resolves. */
  drift?: DriftState;
  /**
   * The one-line human location the panel heads the thread with. Resolved here
   * rather than in `findingLocation` because naming a section needs the Review's
   * walkthroughs, which the shared (CLI-facing) reader has no handle on.
   */
  location: string;
  /**
   * The step of a tour the finding can be shown in. Absent unless the anchor is
   * a section of a walkthrough the pillar still renders — an anchor left on a
   * superseded tour has a name to read but nowhere to jump to.
   */
  section?: FindingSection;
  /** The surface the finding is read on, for filtering by where it lives. */
  surface?: FindingSurface;
}

export function useFindings(): { visible: FindingListItem[] } {
  const { data: review } = useQuery(reviewQueryOptions);
  const { data: change } = useQuery(diffQueryOptions);
  const filters = useAtomValue(findingFiltersAtom);

  const findings = review?.findings;
  const patch = change?.patch;
  const walkthroughs = review?.walkthroughs;
  const reviewTitle = review?.review.title ?? "";

  const drift = useDrift({
    findings: review?.findings ?? [],
    patch: patch ?? "",
    walkthroughs: review?.walkthroughs ?? [],
  });

  const list = useMemo(() => {
    const entries = findings ?? [];

    const anchorFileById = new Map(
      entries.map((entry) => [entry.id, entry.anchorFile])
    );
    const itemIdByPath = new Map(
      parsePatchFiles(patch ?? "").map((file) => [file.path, file.id])
    );
    const sectionTitles = new Map(
      (walkthroughs ?? []).flatMap((walkthrough) =>
        walkthrough.sections.map(
          (section) =>
            [sectionKey(walkthrough.id, section.id), section.title] as const
        )
      )
    );

    // Only the tours the pillars actually render can be jumped into, so the
    // reachable sections are gathered from those rather than from every
    // walkthrough the Review has ever held.
    const shownTours = [
      {
        pillar: "code",
        walkthrough: latestCodeWalkthrough(walkthroughs ?? []),
      },
      {
        pillar: "product",
        walkthrough: latestProductWalkthrough(walkthroughs ?? []),
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

    // The pillar of every tour the Review holds, superseded ones included: a
    // finding left on an old tour is still a finding about that pillar, so it
    // belongs in that filter even though there is nowhere to jump to.
    const pillarByTour = new Map(
      (walkthroughs ?? []).map(
        (walkthrough) => [walkthrough.id, walkthrough.kind] as const
      )
    );

    function locationOf(finding: FoldedFinding): string {
      const { anchor } = finding;

      // A finding on no particular part of the change is a finding on the
      // Review, so it reads as the Review — "Whole change" only where the
      // Review has yet to be named.
      if (anchor?.kind === ANCHOR_KIND.change && reviewTitle !== "") {
        return reviewTitle;
      }

      if (anchor?.kind !== ANCHOR_KIND.walkthroughSection) {
        return findingLocation(anchor);
      }

      const title = sectionTitles.get(
        sectionKey(anchor.walkthroughId, anchor.sectionId)
      );

      // The step's own title, unadorned — the panel heads every other kind of
      // thread with the plain name of where it is, and a section is no different.
      // Falling back to the raw id keeps that true for a superseded tour.
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
