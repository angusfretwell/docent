/**
 * The client's drift layer: it turns the Review's Findings and the current
 * Change's patch into a per-Finding drift read the panel and the inline diff
 * both consume (data-model.md §6). The synchronous fast paths (`planDrift`)
 * settle most Findings without touching the network; only a line anchor whose
 * born blob no longer matches the current side triggers a lazy blob-to-blob
 * re-anchor, fetched on demand and cached forever (the blobs are
 * content-addressed).
 *
 * `indexDiffFiles` and `anchorContext` are the pure seam — they read the parsed
 * patch, never the DOM — so the fast-path decisions are unit-tested; `useDrift`
 * is the thin React wiring that resolves the re-anchors.
 */

import { processPatch } from "@pierre/diffs";
import {
  excerptLines,
  isRealObjectId,
  planDrift,
  reanchorRange,
  splitLines,
} from "@shared/lib/drift";
import { foldFinding } from "@shared/lib/finding";
import { identityAnchorDrift } from "@shared/lib/identity-drift";
import type { DriftState } from "@shared/enums/drift-state";
import type { AnchorContext, DriftPlan } from "@shared/schemas/drift";
import type { Anchor } from "@shared/schemas/finding";
import type { FindingEntry, WalkthroughEntry } from "@shared/schemas/review";
import { useEffect, useState } from "react";

import { fetchBlobText } from "./blobs";

/** One changed file's identity as drift reads it: its shas, its rename/delete standing. */
export interface DriftFile {
  deleted: boolean;
  name: string;
  newObjectId?: string;
  prevName?: string;
  prevObjectId?: string;
  renamed: boolean;
}

/** Index the patch's files by every path they answer to (new name and, for renames, the old). */
export function indexDiffFiles(patch: string): Map<string, DriftFile> {
  const byPath = new Map<string, DriftFile>();
  for (const file of processPatch(patch).files) {
    const entry: DriftFile = {
      deleted: file.type === "deleted",
      name: file.name,
      newObjectId: file.newObjectId,
      prevName: file.prevName,
      prevObjectId: file.prevObjectId,
      renamed: file.type === "rename-pure" || file.type === "rename-changed",
    };
    byPath.set(file.name, entry);
    if (file.prevName !== undefined) {
      byPath.set(file.prevName, entry);
    }
  }
  return byPath;
}

/**
 * The current-Change context for a code anchor: the blob sha on its own side and
 * whether its file was deleted or renamed away from the born path. A non-code
 * anchor, or a file absent from the change (unchanged base..head), yields the
 * empty context — which `planDrift` reads as live.
 */
export function anchorContext(
  anchor: Anchor,
  files: ReadonlyMap<string, DriftFile>
): AnchorContext {
  if (anchor.kind !== "file" && anchor.kind !== "line") {
    return {};
  }
  const file = files.get(anchor.file);
  if (file === undefined) {
    return {};
  }
  const currentSideSha =
    anchor.side === "head" ? file.newObjectId : file.prevObjectId;
  return {
    ...(currentSideSha === undefined ? {} : { currentSideSha }),
    deleted: file.deleted,
    renamed: file.renamed && anchor.file === file.prevName,
  };
}

/** A Finding's drift as the UI renders it: its state, its (re-anchored) lines, and detach text. */
export interface DriftResult {
  /** The born text for an outdated line anchor — expanded in place when detached. */
  bornText?: string;
  /** The line range to render at — born for live/outdated, re-anchored for shifted. */
  lines?: [number, number];
  state: DriftState;
}

/**
 * A content anchor whose born blob no longer matches the current side: fetch
 * both blobs and re-anchor the born range against the current one. Keyed by an
 * opaque id (a Finding id, or a walkthrough range key) so the same lazy machinery
 * serves both surfaces.
 */
export interface ReanchorJob {
  bornSha: string;
  currentSha: string;
  id: string;
  range: [number, number];
}

// A line anchor whose current side is gone (a deletion, or the base of an add)
// is settled outdated with no blob to re-anchor against — but its born blob is
// still addressable, so we fetch just that to detach against its born text
// (data-model.md §6.1: "renders against its born text, recoverable via blobSha").
export interface ExcerptJob {
  bornSha: string;
  id: string;
  range: [number, number];
}

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

/**
 * How one planned anchor folds into the drift buckets: a settled `base` result to
 * place by id, plus any fetch `job`/`excerpt` its resolution still needs.
 */
export interface PlanTriage {
  base?: DriftResult;
  excerpt?: ExcerptJob;
  job?: ReanchorJob;
}

/**
 * Triage one content anchor's drift plan into the buckets the drift map fills by
 * id (data-model.md §6.1):
 *
 * - a **settled** plan is a `base` result at `lines` — a line/range anchor's own
 *   lines, absent for a whole-`file`/`change` anchor;
 * - a **re-anchor** whose current side still names real content becomes a fetch
 *   `job`;
 * - a re-anchor whose current side is gone is `outdated` at once and, if its born
 *   blob is still addressable, additionally asks for an `excerpt` to detach
 *   against.
 */
export function triagePlan(
  id: string,
  plan: DriftPlan,
  lines?: [number, number]
): PlanTriage {
  if (plan.kind === "resolved") {
    return {
      base: { state: plan.state, ...(lines === undefined ? {} : { lines }) },
    };
  }
  if (isRealObjectId(plan.currentSha)) {
    return {
      job: {
        bornSha: plan.bornSha,
        currentSha: plan.currentSha,
        id,
        range: plan.range,
      },
    };
  }
  if (isRealObjectId(plan.bornSha)) {
    // The current side is gone (a deletion), so the anchor is outdated — read as
    // outdated at once, then detach against its still-addressable born text once
    // fetched.
    return {
      base: { lines: plan.range, state: "outdated" },
      excerpt: { bornSha: plan.bornSha, id, range: plan.range },
    };
  }
  return { base: { lines: plan.range, state: "outdated" } };
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
