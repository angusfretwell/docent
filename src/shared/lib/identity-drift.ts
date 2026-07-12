/**
 * Identity-addressed drift — the analog of the content-addressed `planDrift`
 * (sibling `drift.ts`) for the four identity anchor arms, which carry no
 * blob-to-blob re-anchor and never `shift` (data-model.md §6.2, walkthroughs.md
 * §8). Runtime-neutral: no Bun or DOM globals, so the server and the client share
 * one definition and every fold is a plain unit-tested function.
 *
 * An identity arm is `live` while its target survives in the **latest**
 * walkthrough of its pillar and `outdated` once superseded — then it detaches and
 * renders against its born target. The "latest walkthrough per pillar" selection
 * this drift is judged against lives here too (`latestCodeWalkthrough` /
 * `latestProductWalkthrough`), since it is the same notion each pillar tab renders
 * and identity drift reads against.
 */

import type { DriftState } from "../schemas/drift";
import type { Anchor } from "../schemas/finding";

/**
 * Identity-based capture/section drift (walkthroughs.md §8). Product has **no
 * blob-to-blob re-anchor and no `shifted`**: a capture or section anchor is
 * `live` while its target still exists in the (immutable) shown walkthrough, and
 * `outdated` once superseded — then it detaches and renders against its born
 * capture. The caller decides presence (a set-membership check); this pins the
 * live/outdated mapping in one place.
 */
export function identityDrift(present: boolean): DriftState {
  return present ? "live" : "outdated";
}

/**
 * The walkthrough a pillar tab shows: the newest entry of `kind` by id. Ids are
 * ULID-shaped, so the lexically-greatest id is the most recently minted — the
 * "one walkthrough per Change per pillar" a tab renders (walkthroughs.md §2).
 */
function latestWalkthrough<T extends { id: string; kind: "code" | "product" }>(
  entries: readonly T[],
  kind: "code" | "product"
): T | undefined {
  let latest: T | undefined;
  for (const entry of entries) {
    if (entry.kind === kind && (latest === undefined || entry.id > latest.id)) {
      latest = entry;
    }
  }
  return latest;
}

/** The newest **code** walkthrough — the one the Code walkthrough tab renders. */
export function latestCodeWalkthrough<
  T extends { id: string; kind: "code" | "product" },
>(entries: readonly T[]): T | undefined {
  return latestWalkthrough(entries, "code");
}

/** The newest **product** walkthrough — the one the Product walkthrough tab renders. */
export function latestProductWalkthrough<
  T extends { id: string; kind: "code" | "product" },
>(entries: readonly T[]): T | undefined {
  return latestWalkthrough(entries, "product");
}

/**
 * The minimal walkthrough shape identity drift reads — a pillar-tagged list of
 * sections, each with the prose and capture placements presence is judged
 * against. Structural, so a `WalkthroughEntry` (which carries more) satisfies
 * it and the tests can hand-build lightweight fixtures.
 */
interface WalkthroughLike {
  id: string;
  kind: "code" | "product";
  sections: readonly {
    body: string;
    captures?: readonly string[];
    id: string;
  }[];
}

/** The capture ids the sections of a walkthrough place, in any section (walkthroughs.md §6). */
function placedCaptureIds(entry: WalkthroughLike | undefined): Set<string> {
  return new Set(
    (entry?.sections ?? []).flatMap((section) => section.captures ?? [])
  );
}

/** A settled identity-arm drift plus the born target an outdated one detaches to. */
export interface IdentityAnchorDrift {
  /** The born section prose (walkthrough-section) or born quote (text-span); absent for capture arms. */
  bornText?: string;
  state: DriftState;
}

/**
 * The identity-addressed drift of an anchor against the current walkthroughs
 * (data-model.md §6.2) — the analog of `planDrift` for the four identity arms,
 * which carry no content-addressed re-anchor and never `shift`. `undefined` for
 * a content anchor (change/file/line), so a caller falls through to `planDrift`.
 *
 * An arm is `live` while its target survives in the **latest** walkthrough of
 * its pillar, `outdated` once the walkthrough is superseded or the target is
 * gone — then it detaches and renders against its born target:
 *
 * - **walkthrough-section** — live only while its `walkthroughId` is still the
 *   latest of its kind and holds the section; detaches to the born section prose,
 *   recovered from the superseded walkthrough still walked off disk.
 * - **screenshot-region / recording-timestamp** — live while its capture is
 *   still placed in a section of the latest product walkthrough; its born image
 *   is recovered in the Product tab, so no `bornText` here.
 * - **text-span** — live while its section survives in the latest product
 *   walkthrough; detaches to its born quote (carried on the anchor itself).
 */
export function identityAnchorDrift(
  anchor: Anchor,
  walkthroughs: readonly WalkthroughLike[]
): IdentityAnchorDrift | undefined {
  if (anchor.kind === "walkthrough-section") {
    const born = walkthroughs.find(
      (entry) => entry.id === anchor.walkthroughId
    );
    const latest = born
      ? latestWalkthrough(walkthroughs, born.kind)
      : undefined;
    const section = born?.sections.find(
      (candidate) => candidate.id === anchor.sectionId
    );
    const present =
      latest?.id === anchor.walkthroughId && section !== undefined;

    return {
      state: identityDrift(present),
      ...(section === undefined ? {} : { bornText: section.body }),
    };
  }

  if (
    anchor.kind === "screenshot-region" ||
    anchor.kind === "recording-timestamp"
  ) {
    const latest = latestProductWalkthrough(walkthroughs);

    return {
      state: identityDrift(placedCaptureIds(latest).has(anchor.capture)),
    };
  }

  if (anchor.kind === "text-span") {
    const latest = latestProductWalkthrough(walkthroughs);
    const present =
      latest?.sections.some((section) => section.id === anchor.section) ??
      false;

    return { bornText: anchor.quote, state: identityDrift(present) };
  }

  return undefined;
}
