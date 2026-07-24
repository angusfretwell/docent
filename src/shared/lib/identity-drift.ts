import type { DriftState } from "../enums/drift-state";
import type { WalkthroughKind } from "../enums/walkthrough-kind";
import type { Anchor } from "../schemas/comment";

export function identityDrift(present: boolean): DriftState {
  return present ? "live" : "outdated";
}

/** Ids are ULID-shaped, so the lexically-greatest id is the most recently minted. */
function latestWalkthrough<T extends { id: string; kind: WalkthroughKind }>(
  entries: readonly T[],
  kind: WalkthroughKind
): T | undefined {
  let latest: T | undefined;
  for (const entry of entries) {
    if (entry.kind === kind && (latest === undefined || entry.id > latest.id)) {
      latest = entry;
    }
  }
  return latest;
}

export function latestCodeWalkthrough<
  T extends { id: string; kind: WalkthroughKind },
>(entries: readonly T[]): T | undefined {
  return latestWalkthrough(entries, "code");
}

export function latestProductWalkthrough<
  T extends { id: string; kind: WalkthroughKind },
>(entries: readonly T[]): T | undefined {
  return latestWalkthrough(entries, "product");
}

interface WalkthroughLike {
  id: string;
  kind: WalkthroughKind;
  sections: readonly {
    body: string;
    captures?: readonly string[];
    id: string;
  }[];
}

function placedCaptureIds(entry: WalkthroughLike | undefined): Set<string> {
  return new Set(
    (entry?.sections ?? []).flatMap((section) => section.captures ?? [])
  );
}

export interface IdentityAnchorDrift {
  /** Born section prose (walkthrough-section) or born quote (text-span); absent for capture arms. */
  bornText?: string;
  state: DriftState;
}

/** `undefined` for a content anchor (change/file/line), so a caller falls through to `planDrift`. */
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
