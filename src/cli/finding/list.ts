import { resolveRepo } from "@core/git";
import { readReviewSnapshot } from "@core/review";
import type { FindingStatus } from "@shared/enums/finding-status";
import { foldFinding, sortFoldedFindings } from "@shared/lib/finding";
import type { FoldedFinding } from "@shared/lib/finding";
import { Effect } from "effect";

export interface FindingFilter {
  status: readonly FindingStatus[];
  anchorFile?: string;
  author?: string;
}

function anchorFileOf(finding: FoldedFinding): string | undefined {
  const { anchor } = finding;
  if (anchor?.kind === "line" || anchor?.kind === "file") {
    return anchor.file;
  }
  return undefined;
}

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
