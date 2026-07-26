import type {
  DriftFile,
  DriftResult,
  ExcerptJob,
  ReanchorJob,
} from "@client/lib/drift";
import { anchorContext, indexDiffFiles, triagePlan } from "@client/lib/drift";
import { blobQueryOptions } from "@client/queries/blob";
import { foldComment } from "@shared/lib/comment";
import {
  excerptLines,
  planDrift,
  reanchorRange,
  splitLines,
} from "@shared/lib/drift";
import { identityAnchorDrift } from "@shared/lib/identity-drift";
import type { Anchor } from "@shared/schemas/comment";
import type { CommentEntry, WalkthroughEntry } from "@shared/schemas/review";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useReanchor(
  jobs: readonly ReanchorJob[],
  excerpts: readonly ExcerptJob[]
): ReadonlyMap<string, DriftResult> {
  const queryClient = useQueryClient();
  const [resolved, setResolved] = useState<ReadonlyMap<string, DriftResult>>(
    new Map()
  );

  const jobsKey = [
    ...jobs.map((job) => `r:${job.id}:${job.bornSha}:${job.currentSha}`),
    ...excerpts.map((job) => `e:${job.id}:${job.bornSha}`),
  ].join("|");

  useEffect(() => {
    let cancelled = false;
    function publish(id: string, result: DriftResult) {
      if (!cancelled) {
        setResolved((prev) => new Map(prev).set(id, result));
      }
    }
    async function reanchor(job: ReanchorJob) {
      try {
        const [bornText, currentText] = await Promise.all([
          queryClient.ensureQueryData(blobQueryOptions(job.bornSha)),
          queryClient.ensureQueryData(blobQueryOptions(job.currentSha)),
        ]);
        const result = reanchorRange(
          splitLines(bornText),
          splitLines(currentText),
          job.range
        );
        publish(job.id, {
          lines: result.lines,
          state: result.state,
          ...(result.state === "outdated"
            ? { bornText: excerptLines(bornText, job.range) }
            : {}),
        });
      } catch {
        // A fetch failure leaves the entry out of the map rather than mis-pinning.
      }
    }
    async function excerpt(job: ExcerptJob) {
      try {
        const bornText = await queryClient.ensureQueryData(
          blobQueryOptions(job.bornSha)
        );
        publish(job.id, {
          bornText: excerptLines(bornText, job.range),
          lines: job.range,
          state: "outdated",
        });
      } catch {
        // Born blob unreachable; the row still reads outdated via base.
      }
    }
    void Promise.all([...jobs.map(reanchor), ...excerpts.map(excerpt)]);
    return () => {
      cancelled = true;
    };
    // jobsKey encodes jobs + excerpts
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsKey]);

  return resolved;
}

function anchorLines(anchor: Anchor): [number, number] | undefined {
  return anchor.kind === "line"
    ? [anchor.lines[0], anchor.lines[1]]
    : undefined;
}

function planComments(
  comments: readonly CommentEntry[],
  files: ReadonlyMap<string, DriftFile>,
  walkthroughs: readonly WalkthroughEntry[]
) {
  const base = new Map<string, DriftResult>();
  const jobs: ReanchorJob[] = [];
  const excerpts: ExcerptJob[] = [];
  for (const comment of comments) {
    const { anchor } = foldComment(comment.id, comment.records);
    if (anchor === undefined) {
      continue;
    }

    // Identity anchors resolve synchronously against the current walkthroughs — no blob fetch (data-model.md §6.2).
    const identity = identityAnchorDrift(anchor, walkthroughs);
    if (identity !== undefined) {
      base.set(comment.id, {
        state: identity.state,
        ...(identity.bornText === undefined
          ? {}
          : { bornText: identity.bornText }),
      });
      continue;
    }

    const plan = planDrift(anchor, anchorContext(anchor, files));
    const triage = triagePlan(comment.id, plan, anchorLines(anchor));
    if (triage.base !== undefined) {
      base.set(comment.id, triage.base);
    }
    if (triage.job !== undefined) {
      jobs.push(triage.job);
    }
    if (triage.excerpt !== undefined) {
      excerpts.push(triage.excerpt);
    }
  }
  return { base, excerpts, jobs };
}

export function useDrift(params: {
  comments: readonly CommentEntry[];
  patch: string;
  walkthroughs: readonly WalkthroughEntry[];
}): ReadonlyMap<string, DriftResult> {
  const files = indexDiffFiles(params.patch);
  const { base, excerpts, jobs } = planComments(
    params.comments,
    files,
    params.walkthroughs
  );
  const resolved = useReanchor(jobs, excerpts);

  const merged = new Map(base);
  for (const [id, result] of resolved) {
    merged.set(id, result);
  }
  return merged;
}
