/**
 * The React wiring over the client's drift seam (`@client/lib/drift`): it plans
 * each Finding's drift synchronously and resolves the anchors that plan could
 * not settle by fetching their content-addressed blobs (data-model.md §6).
 */

import { fetchBlobText } from "@client/lib/blobs";
import type {
  DriftFile,
  DriftResult,
  ExcerptJob,
  ReanchorJob,
} from "@client/lib/drift";
import { anchorContext, indexDiffFiles, triagePlan } from "@client/lib/drift";
import {
  excerptLines,
  planDrift,
  reanchorRange,
  splitLines,
} from "@shared/lib/drift";
import { foldFinding } from "@shared/lib/finding";
import { identityAnchorDrift } from "@shared/lib/identity-drift";
import type { Anchor } from "@shared/schemas/finding";
import type { FindingEntry, WalkthroughEntry } from "@shared/schemas/review";
import { useEffect, useState } from "react";

/**
 * The lazy re-anchor engine behind the Finding drift map (`useDrift`). Given the
 * fetch jobs a caller's synchronous plan could not settle, it fetches the
 * content-addressed blobs (cached forever), runs `reanchorRange`, and folds each
 * result in by id as it lands — so the returned map only ever grows more
 * precise, never mis-pinning a still-in-flight entry. A stable `jobsKey` keeps
 * the effect from re-firing on every render.
 */
export function useReanchor(
  jobs: readonly ReanchorJob[],
  excerpts: readonly ExcerptJob[]
): ReadonlyMap<string, DriftResult> {
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
          fetchBlobText(job.bornSha),
          fetchBlobText(job.currentSha),
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
        // Leave the entry out of the map until a later render can re-anchor it;
        // a fetch failure never mis-pins.
      }
    }
    async function excerpt(job: ExcerptJob) {
      try {
        const bornText = await fetchBlobText(job.bornSha);
        publish(job.id, {
          bornText: excerptLines(bornText, job.range),
          lines: job.range,
          state: "outdated",
        });
      } catch {
        // The born blob is unreachable; the row still reads outdated via base.
      }
    }
    void Promise.all([...jobs.map(reanchor), ...excerpts.map(excerpt)]);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jobsKey encodes jobs + excerpts
  }, [jobsKey]);

  return resolved;
}

/** Line range carried straight through for a line anchor; nothing for other arms. */
function anchorLines(anchor: Anchor): [number, number] | undefined {
  return anchor.kind === "line"
    ? [anchor.lines[0], anchor.lines[1]]
    : undefined;
}

function planFindings(
  findings: readonly FindingEntry[],
  files: ReadonlyMap<string, DriftFile>,
  walkthroughs: readonly WalkthroughEntry[]
) {
  const base = new Map<string, DriftResult>();
  const jobs: ReanchorJob[] = [];
  const excerpts: ExcerptJob[] = [];
  for (const finding of findings) {
    const { anchor } = foldFinding(finding.id, finding.records);
    if (anchor === undefined) {
      continue;
    }

    // Identity arms (walkthrough-section, capture, text-span) carry no
    // content-addressed drift: their live/outdated standing is an identity read
    // against the current walkthroughs, and an outdated one detaches to its born
    // target synchronously — no blob fetch (data-model.md §6.2).
    const identity = identityAnchorDrift(anchor, walkthroughs);
    if (identity !== undefined) {
      base.set(finding.id, {
        state: identity.state,
        ...(identity.bornText === undefined
          ? {}
          : { bornText: identity.bornText }),
      });
      continue;
    }

    const plan = planDrift(anchor, anchorContext(anchor, files));
    const triage = triagePlan(finding.id, plan, anchorLines(anchor));
    if (triage.base !== undefined) {
      base.set(finding.id, triage.base);
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

/**
 * The per-Finding drift map. Fast-path results are ready synchronously; a line
 * anchor needing a re-anchor is fetched lazily and folded in as it resolves, so
 * the map only ever grows more precise — a drifted Finding stays out of the
 * inline diff until it re-anchors, never mis-pinned.
 */
export function useDrift(params: {
  findings: readonly FindingEntry[];
  patch: string;
  walkthroughs: readonly WalkthroughEntry[];
}): ReadonlyMap<string, DriftResult> {
  const files = indexDiffFiles(params.patch);
  const { base, excerpts, jobs } = planFindings(
    params.findings,
    files,
    params.walkthroughs
  );
  const resolved = useReanchor(jobs, excerpts);

  // A re-anchor job carries no synchronous base entry, so it is simply absent
  // from the map until its fetch resolves — which reads as "no drift yet": the
  // inline diff drops it (never mis-pinned) and the panel shows it un-badged,
  // both correcting the moment the re-anchor lands. Consumers look drift up by
  // id, so a resolved entry for a since-removed Finding is harmless.
  const merged = new Map(base);
  for (const [id, result] of resolved) {
    merged.set(id, result);
  }
  return merged;
}
