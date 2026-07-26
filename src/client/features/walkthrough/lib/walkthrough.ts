/** @see walkthroughs.md §4–§5 — the step model both walkthrough pillars render. */

import type { SectionFold } from "@shared/lib/walkthrough-segments";
import {
  foldCaptureSection,
  foldRangeSection,
} from "@shared/lib/walkthrough-segments";
import type {
  Capture,
  WalkthroughRange,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";
import { capitalize } from "radashi";

/** Section id plus the target's index within the section, so keys survive section reordering. */
export function targetKey(sectionId: string, index: number): string {
  return `${sectionId}#${index}`;
}

export interface WalkthroughStep {
  fold: SectionFold;
  section: WalkthroughSection;
}

export interface StepLayout {
  heading: string | undefined;
  prose: string;
  trailing: string[];
}

/**
 * A marker-less section takes the flat fallback with every target trailing; the
 * first is hoisted to the heading instead, since anchoring all of them after the
 * prose would lag the tour a whole section behind.
 */
export function stepLayout(step: WalkthroughStep): StepLayout {
  const { placed, prose, trailing } = step.fold;

  function keyAt(index: number) {
    return targetKey(step.section.id, index);
  }

  const [first, ...rest] = trailing;

  if (placed.length === 0 && first !== undefined) {
    return { heading: keyAt(first), prose, trailing: rest.map(keyAt) };
  }

  return { heading: undefined, prose, trailing: trailing.map(keyAt) };
}

export function codeSteps(
  sections: readonly WalkthroughSection[]
): WalkthroughStep[] {
  return sections.map((section) => ({
    fold: foldRangeSection(section.body, section.ranges?.length ?? 0),
    section,
  }));
}

export function productSteps(
  sections: readonly WalkthroughSection[]
): WalkthroughStep[] {
  return sections.map((section) => ({
    fold: foldCaptureSection(section.body, section.captures?.length ?? 0),
    section,
  }));
}

export function rangesByKey(
  sections: readonly WalkthroughSection[]
): Map<string, WalkthroughRange> {
  return new Map(
    sections.flatMap((section) =>
      (section.ranges ?? []).map(
        (range, index) => [targetKey(section.id, index), range] as const
      )
    )
  );
}

export interface PlacedCapture {
  capture: Capture;
  kindOrdinal: number;
  ordinal: number;
  section: WalkthroughSection;
}

/**
 * A section referencing a capture id the registry doesn't hold contributes
 * nothing. `ordinal` numbers the captures across the whole tour and
 * `kindOrdinal` within its own kind, both in first-reach order; the same id
 * keeps its numbers across placements.
 */
export function capturesByKey(
  sections: readonly WalkthroughSection[],
  registry: readonly Capture[]
): Map<string, PlacedCapture> {
  const byId = new Map(registry.map((capture) => [capture.id, capture]));
  const assigned = new Map<string, { kindOrdinal: number; ordinal: number }>();
  const kindCounts = new Map<Capture["kind"], number>();

  function ordinalsFor(capture: Capture) {
    const seen = assigned.get(capture.id);

    if (seen !== undefined) {
      return seen;
    }

    const kindOrdinal = (kindCounts.get(capture.kind) ?? 0) + 1;
    const numbered = { kindOrdinal, ordinal: assigned.size + 1 };
    kindCounts.set(capture.kind, kindOrdinal);
    assigned.set(capture.id, numbered);

    return numbered;
  }

  return new Map(
    sections.flatMap((section) =>
      (section.captures ?? []).flatMap((captureId, index) => {
        const capture = byId.get(captureId);

        return capture === undefined
          ? []
          : [
              [
                targetKey(section.id, index),
                { capture, ...ordinalsFor(capture), section },
              ] as const,
            ];
      })
    )
  );
}

export function captureLabel({ capture, kindOrdinal }: PlacedCapture): string {
  return capture.title ?? `${capitalize(capture.kind)} ${kindOrdinal}`;
}

/** The distinct files a code walkthrough's ranges touch, in first-reference order — the diff panel's filter and order. */
export function walkthroughPaths(
  sections: readonly WalkthroughSection[]
): Set<string> {
  return new Set(
    sections.flatMap((section) =>
      (section.ranges ?? []).map((range) => range.file)
    )
  );
}
