import type { WalkthroughKind } from "../enums/walkthrough-kind";
import { WalkthroughKind as Kind } from "../enums/walkthrough-kind";
import { WalkthroughState } from "../enums/walkthrough-state";
import type { ChangeRecord, WalkthroughEntry } from "../schemas/review";
import { walkthroughStaleness } from "./walkthrough-callouts";

export interface WalkthroughStatus {
  changesBehind: number;
  state: WalkthroughState;
  walkthroughId?: string;
}

/** No Change carries this id, so it counts toward the sequence length without ever matching a walkthrough's `bornChangeId`. */
const UNRECORDED_HEAD = { id: "" };

/**
 * The head is only recorded as a Change once something writes against it, so a
 * walkthrough born on the previous head reads as zero behind until then. Adding
 * the unrecorded head to the sequence is what makes the count answer "behind the
 * branch" rather than "behind the last write".
 */
function changeSequence(
  changes: readonly ChangeRecord[],
  headSha: string
): readonly { id: string }[] {
  const recorded = changes.some((change) => change.headSha === headSha);

  return recorded ? changes : [...changes, UNRECORDED_HEAD];
}

function newest(
  walkthroughs: readonly WalkthroughEntry[],
  kind: WalkthroughKind
): WalkthroughEntry | undefined {
  return walkthroughs
    .filter((entry) => entry.kind === kind && entry.manifest !== undefined)
    .toSorted((left, right) => left.id.localeCompare(right.id))
    .at(-1);
}

function statusOf(
  entry: WalkthroughEntry | undefined,
  sequence: readonly { id: string }[]
): WalkthroughStatus {
  if (entry?.manifest === undefined) {
    return { changesBehind: 0, state: WalkthroughState.Absent };
  }

  const { behind } = walkthroughStaleness(
    entry.manifest.bornChangeId,
    sequence
  );
  if (behind > 0) {
    return {
      changesBehind: behind,
      state: WalkthroughState.Stale,
      walkthroughId: entry.id,
    };
  }

  // A shell with no narration is a run that stopped before its prose landed,
  // so it reads as `empty` rather than `current` and the next run refills it.
  const state =
    entry.sections.length === 0
      ? WalkthroughState.Empty
      : WalkthroughState.Current;

  return { changesBehind: 0, state, walkthroughId: entry.id };
}

/** Answers "is there a walkthrough for this head?" per kind — the question a run asks before it writes one. */
export function walkthroughStatuses(params: {
  changes: readonly ChangeRecord[];
  headSha: string;
  walkthroughs: readonly WalkthroughEntry[];
}): Record<WalkthroughKind, WalkthroughStatus> {
  const sequence = changeSequence(params.changes, params.headSha);

  return {
    [Kind.Code]: statusOf(newest(params.walkthroughs, Kind.Code), sequence),
    [Kind.Product]: statusOf(
      newest(params.walkthroughs, Kind.Product),
      sequence
    ),
  };
}
