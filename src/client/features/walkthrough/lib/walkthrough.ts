/**
 * The step model both walkthrough pillars render (walkthroughs.md §4, §5).
 *
 * A walkthrough is a two-panel read: prose on the left, its targets on the
 * right. The panels stay in step because every `{{range:i}}` / `{{capture:i}}`
 * marker the author wrote becomes an addressable point in the prose — the fold
 * below rewrites each marker into an inline chip and pairs it with a stable key.
 * The chip is both the anchor the active-target reading keys off and the control
 * a reader clicks to aim the panel deliberately; the target panel resolves the
 * active key back to the range or capture to show.
 *
 * The marker positions are the only sync signal, so a section that carries no
 * markers still works: `foldRangeSection` reports its targets as trailing (§5's
 * flat fallback) and `stepLayout` gives them a home. No DOM or React here.
 */

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

/**
 * The anchor key for one target of one section — the identity the prose chip and
 * the target panel agree on. Section id plus the target's index into the
 * section's own target list, so it survives sections being reordered.
 */
export function targetKey(sectionId: string, index: number): string {
  return `${sectionId}#${index}`;
}

/** One section as rendered: its prose, with each of its targets placed. */
export interface WalkthroughStep {
  fold: SectionFold;
  section: WalkthroughSection;
}

/** Where a step's target chips sit relative to its prose. */
export interface StepLayout {
  /** The target chipped beside the section heading, if one was hoisted there. */
  heading: string | undefined;
  /** The body, with the chip link of each placed target inline. */
  prose: string;
  /** Targets no marker placed, chipped after the prose in index order. */
  trailing: string[];
}

/**
 * Place a step's targets around its prose.
 *
 * A section whose author placed `{{range:i}}` / `{{capture:i}}` markers carries
 * its chips inline at those positions verbatim — that placement is the whole
 * point of the syntax. A section without them took the flat fallback (§5), which
 * leaves every target trailing the prose; anchoring there would mean the reader
 * has to scroll past the entire section before its target activates, so the tour
 * would lag a section behind for its whole length.
 *
 * The first target is hoisted to the heading instead — a reader arriving at the
 * heading is already reading about it. Any further targets stay after the prose,
 * activating as the reader leaves the section; without markers there is no
 * authored position to spread them across.
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

/** Fold the sections of a code walkthrough into steps over their `{{range:i}}` markers. */
export function codeSteps(
  sections: readonly WalkthroughSection[]
): WalkthroughStep[] {
  return sections.map((section) => ({
    fold: foldRangeSection(section.body, section.ranges?.length ?? 0),
    section,
  }));
}

/** Fold the sections of a product walkthrough into steps over their `{{capture:i}}` markers. */
export function productSteps(
  sections: readonly WalkthroughSection[]
): WalkthroughStep[] {
  return sections.map((section) => ({
    fold: foldCaptureSection(section.body, section.captures?.length ?? 0),
    section,
  }));
}

/** Every code target keyed by its anchor key, for resolving the active range. */
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

/** A placed capture and the section that placed it — the pins it carries live on the section. */
export interface PlacedCapture {
  capture: Capture;
  /** Where the capture falls among the tour's captures of its kind, from 1. */
  ordinal: number;
  section: WalkthroughSection;
}

/**
 * Every product target keyed by its anchor key, resolved through the manifest's
 * `captures[]` registry. A section referencing a capture id the registry doesn't
 * hold contributes nothing — the panel renders its empty state rather than
 * breaking the tour.
 *
 * Each capture is numbered within its own kind, in the order the tour first
 * reaches it, so the reader counts screenshots and recordings as two separate
 * runs. The number is per capture rather than per placement: a capture the prose
 * returns to is the same "Screenshot 3" both times. The ordinal is the fallback
 * name — a capture with its own `title` shows that instead (`captureLabel`).
 */
export function capturesByKey(
  sections: readonly WalkthroughSection[],
  registry: readonly Capture[]
): Map<string, PlacedCapture> {
  const byId = new Map(registry.map((capture) => [capture.id, capture]));
  const assigned = new Map<string, number>();
  const counts = new Map<Capture["kind"], number>();

  function ordinalFor(capture: Capture): number {
    const seen = assigned.get(capture.id);

    if (seen !== undefined) {
      return seen;
    }

    const next = (counts.get(capture.kind) ?? 0) + 1;
    counts.set(capture.kind, next);
    assigned.set(capture.id, next);

    return next;
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
                { capture, ordinal: ordinalFor(capture), section },
              ] as const,
            ];
      })
    )
  );
}

/**
 * How a capture reads wherever it is named: its authored `title` if it has one,
 * else its kind and number ("Screenshot 3") as the fallback for an untitled or
 * hand-authored capture.
 */
export function captureLabel({ capture, ordinal }: PlacedCapture): string {
  return capture.title ?? `${capitalize(capture.kind)} ${ordinal}`;
}

/**
 * The distinct files a code walkthrough's ranges touch — the diff panel's filter
 * and its order. Iteration order is first-reference order: a file sits where the
 * prose first reaches it, so the panel reads in the sequence the tour narrates
 * rather than the tree order the standalone Diff view sorts into.
 */
export function walkthroughPaths(
  sections: readonly WalkthroughSection[]
): Set<string> {
  return new Set(
    sections.flatMap((section) =>
      (section.ranges ?? []).map((range) => range.file)
    )
  );
}
