/**
 * The client's drift layer: it turns the Dossier's Findings and the current
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
import { useEffect, useState } from "react";
import type { AnchorContext, DriftState } from "../shared/drift.ts";
import { excerptLines, planDrift, reanchorRange, splitLines } from "../shared/drift.ts";
import type { FindingEntry } from "../shared/dossier.ts";
import type { Anchor } from "../shared/finding.ts";
import { foldFinding } from "../shared/finding.ts";
import { fetchBlobText, isRealObjectId } from "./blobs.ts";

/** One changed file's identity as drift reads it: its shas, its rename/delete standing. */
export interface DiffFile {
  deleted: boolean;
  name: string;
  newObjectId?: string;
  prevName?: string;
  prevObjectId?: string;
  renamed: boolean;
}

/** Index the patch's files by every path they answer to (new name and, for renames, the old). */
export function indexDiffFiles(patch: string): Map<string, DiffFile> {
  const byPath = new Map<string, DiffFile>();
  for (const file of processPatch(patch).files) {
    const entry: DiffFile = {
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
export function anchorContext(anchor: Anchor, files: ReadonlyMap<string, DiffFile>): AnchorContext {
  if (anchor.kind !== "file" && anchor.kind !== "line") {
    return {};
  }
  const file = files.get(anchor.file);
  if (file === undefined) {
    return {};
  }
  const currentSideSha = anchor.side === "head" ? file.newObjectId : file.prevObjectId;
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

interface ReanchorJob {
  bornSha: string;
  currentSha: string;
  id: string;
  range: [number, number];
}

/** Line range carried straight through for a line anchor; nothing for other arms. */
function anchorLines(anchor: Anchor): [number, number] | undefined {
  return anchor.kind === "line" ? [anchor.lines[0], anchor.lines[1]] : undefined;
}

function planFindings(findings: readonly FindingEntry[], files: ReadonlyMap<string, DiffFile>) {
  const base = new Map<string, DriftResult>();
  const jobs: ReanchorJob[] = [];
  for (const finding of findings) {
    const { anchor } = foldFinding(finding.id, finding.records);
    if (anchor === undefined) {
      continue;
    }
    const plan = planDrift(anchor, anchorContext(anchor, files));
    if (plan.kind === "resolved") {
      const lines = anchorLines(anchor);
      base.set(finding.id, { state: plan.state, ...(lines === undefined ? {} : { lines }) });
    } else if (isRealObjectId(plan.bornSha) && isRealObjectId(plan.currentSha)) {
      jobs.push({ ...plan, id: finding.id });
    } else {
      // A null-sha side (a deletion, or a base side of an add) has no blob to
      // diff against — the anchored code is gone, so the Finding is outdated.
      base.set(finding.id, { lines: plan.range, state: "outdated" });
    }
  }
  return { base, jobs };
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
}): ReadonlyMap<string, DriftResult> {
  const files = indexDiffFiles(params.patch);
  const { base, jobs } = planFindings(params.findings, files);
  const [resolved, setResolved] = useState<ReadonlyMap<string, DriftResult>>(new Map());

  // A stable key so the fetch effect only re-runs when the set of re-anchor jobs
  // actually changes, not on every render.
  const jobsKey = jobs.map((job) => `${job.id}:${job.bornSha}:${job.currentSha}`).join("|");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      for (const job of jobs) {
        try {
          const [bornText, currentText] = await Promise.all([
            fetchBlobText(job.bornSha),
            fetchBlobText(job.currentSha),
          ]);
          if (cancelled) {
            return;
          }
          const reanchor = reanchorRange(splitLines(bornText), splitLines(currentText), job.range);
          const result: DriftResult = {
            lines: reanchor.lines,
            state: reanchor.state,
            ...(reanchor.state === "outdated"
              ? { bornText: excerptLines(bornText, job.range) }
              : {}),
          };
          setResolved((prev) => new Map(prev).set(job.id, result));
        } catch {
          // Leave the Finding out of the inline diff until a later render can
          // re-anchor it; a fetch failure never mis-pins.
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jobsKey encodes jobs
  }, [jobsKey]);

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
