import { processPatch } from "@pierre/diffs";
import type { DriftState } from "@shared/enums/drift-state";
import type { AnchorContext, DriftPlan } from "@shared/lib/drift";
import { isRealObjectId } from "@shared/lib/patch";
import type { Anchor } from "@shared/schemas/comment";

export interface DriftFile {
  deleted: boolean;
  name: string;
  newObjectId?: string;
  prevName?: string;
  prevObjectId?: string;
  renamed: boolean;
}

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

// A non-code anchor, or a file absent from the change, yields the empty context, which `planDrift` reads as live.
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

export interface DriftResult {
  bornText?: string;
  /** Born lines for live/outdated, re-anchored lines for shifted. */
  lines?: [number, number];
  state: DriftState;
}

export interface ReanchorJob {
  bornSha: string;
  currentSha: string;
  id: string;
  range: [number, number];
}

// A line anchor whose current side is gone: fetch only its still-addressable born blob to detach against born text (data-model.md §6.1).
export interface ExcerptJob {
  bornSha: string;
  id: string;
  range: [number, number];
}

export interface PlanTriage {
  base?: DriftResult;
  excerpt?: ExcerptJob;
  job?: ReanchorJob;
}

// Triage one content anchor's drift plan into the base/job/excerpt buckets (data-model.md §6.1).
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
    return {
      base: { lines: plan.range, state: "outdated" },
      excerpt: { bornSha: plan.bornSha, id, range: plan.range },
    };
  }
  return { base: { lines: plan.range, state: "outdated" } };
}
