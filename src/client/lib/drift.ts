/**
 * The client's drift layer: it turns the Review's Findings and the current
 * Change's patch into a per-Finding drift read the panel and the inline diff
 * both consume (data-model.md §6). The synchronous fast paths (`planDrift`)
 * settle most Findings without touching the network; only a line anchor whose
 * born blob no longer matches the current side triggers a lazy blob-to-blob
 * re-anchor, fetched on demand and cached forever (the blobs are
 * content-addressed).
 *
 * This module is the pure seam — it reads the parsed patch, never the DOM or the
 * network — so the fast-path decisions are unit-tested; `@client/hooks/use-drift`
 * is the thin React wiring that resolves the re-anchors.
 */

import { processPatch } from "@pierre/diffs";
import type { DriftState } from "@shared/enums/drift-state";
import type { AnchorContext, DriftPlan } from "@shared/lib/drift";
import { isRealObjectId } from "@shared/lib/patch";
import type { Anchor } from "@shared/schemas/finding";

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
