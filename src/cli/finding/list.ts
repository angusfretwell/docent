/**
 * `docent finding list` — the review loop's **fetch-findings** primitive. It
 * walks the active Review, folds every Finding through the identical
 * `foldFinding` the Findings panel renders, filters the queue on status ×
 * scope, and returns it in reading order.
 *
 * The filter is pure (unit-tested directly); the effectful layer resolves git +
 * fs. The write half of the primitive pair lives in `./write`.
 */

import { resolveRepo } from "@core/git";
import { readReviewSnapshot } from "@core/review";
import type { FindingStatus } from "@shared/enums/finding-status";
import { foldFinding, sortFoldedFindings } from "@shared/lib/finding";
import type { FoldedFinding } from "@shared/lib/finding";
import { Effect } from "effect";

/** The queue filter: status × scope. */
export interface FindingFilter {
  /** Keep only Findings in these statuses (any-of); empty keeps all. */
  status: readonly FindingStatus[];
  /** Keep only findings anchored on this file (the `line`/`file` code arms). */
  anchorFile?: string;
  /** Keep only findings this author id participated in. */
  author?: string;
}

/** The anchored file of a folded Finding's `line`/`file` code arm, else none. */
function anchorFileOf(finding: FoldedFinding): string | undefined {
  const { anchor } = finding;
  if (anchor?.kind === "line" || anchor?.kind === "file") {
    return anchor.file;
  }
  return undefined;
}

/** Apply a queue filter to folded Findings — pure, so it is unit-tested alone. */
export function applyFindingFilter(
  findings: readonly FoldedFinding[],
  filter: FindingFilter
): FoldedFinding[] {
  const status = new Set(filter.status);
  return findings.filter((finding) => {
    if (status.size > 0 && !status.has(finding.status)) {
      return false;
    }
    if (
      filter.anchorFile !== undefined &&
      anchorFileOf(finding) !== filter.anchorFile
    ) {
      return false;
    }
    if (
      filter.author !== undefined &&
      !finding.participants.some(
        (participant) => participant.id === filter.author
      )
    ) {
      return false;
    }
    return true;
  });
}

/**
 * fetch-findings: walk the active Review, fold every Finding, filter the queue,
 * and return it in reading order. The identical fold the Findings panel renders
 * (`foldFinding`) — one derivation of status / participants.
 */
export const listFindings = Effect.fn("listFindings")(function* listFindings(
  cwd: string,
  filter: FindingFilter
) {
  const repo = yield* resolveRepo(cwd);
  const snapshot = yield* readReviewSnapshot({
    base: repo.defaultBranch.name,
    branch: repo.branch,
    root: repo.root,
  });
  const folded = snapshot.findings.map((entry) =>
    foldFinding(entry.id, entry.records)
  );
  return sortFoldedFindings(applyFindingFilter(folded, filter));
});
