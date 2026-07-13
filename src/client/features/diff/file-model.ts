/**
 * The Diff tab's pure file model: the ordered file list (path/size sort, or an
 * explicit walkthrough order), per-file edge-case classification, the
 * mark-as-viewed fold, and the tree/anchor/row-state views the tree and the
 * scroll render from. Factored out of `diff-view.tsx` so the derivation is
 * colocated-tested and the component stays about wiring state to hooks.
 *
 * No DOM or React here — the live viewed state (the optimistic overlay
 * `useViewedState` layers over `viewedModel`) is threaded in as a plain
 * `isViewed` function, so this module never needs to know about React state.
 */

import type { FileClass } from "@client/lib/edge-cases";
import { autoViewed, classifyFiles } from "@client/lib/edge-cases";
import type {
  ChangeAnchor,
  FileEntry,
  FileOrder,
  TreeNode,
} from "@client/lib/nav";
import {
  buildTree,
  changeAnchors,
  filterEntries,
  flattenFiles,
  orderByFiles,
  parseFiles,
  sortEntries,
} from "@client/lib/nav";
import type { ViewedModel } from "@client/lib/viewed";
import { computeViewed, viewedStateFor } from "@client/lib/viewed";
import type { FindingEntry, ViewedEvent } from "@shared/schemas/review";
import { sift } from "radashi";

import type { RowState } from "./file-tree";

// The no-edge-case default, so a file absent from the classification map (or a
// lookup miss) reads as an ordinary diff.
const NORMAL_CLASS: FileClass = {
  binary: false,
  generated: false,
  image: false,
  large: false,
  modeOnly: false,
  renameModify: false,
  renamePure: false,
  submodule: false,
};

export interface FileModel {
  /** Every file in the Change, ordered per the sort toggle or an explicit walkthrough order. */
  allEntries: FileEntry[];
  entryById: ReadonlyMap<string, FileEntry>;
  /** Per-file edge-case classification (diff-review.md §5), keyed by item id. */
  classFor: (id: string) => FileClass;
  /** The mark-as-viewed fold (diff-review.md §3). */
  viewedModel: ViewedModel;
  /** Anchored files, from the finding fold — the has-findings quick filter. */
  findingPaths: ReadonlySet<string>;
  /** A walkthrough-order override is active, overriding the path/size toggle. */
  explicitOrder: boolean;
}

/**
 * Derive the Diff tab's file model from a Change's patch. `fileOrder`, when
 * non-empty, wins over `order` (diff-review.md §2). `generated` is the
 * server's `.gitattributes linguist-generated` set, unioned with the built-in
 * glob set inside `classifyFiles`.
 */
export function buildFileModel(params: {
  patch: string;
  generated: readonly string[];
  order: FileOrder;
  fileOrder?: readonly string[];
  viewedEvents: readonly ViewedEvent[];
  findings: readonly FindingEntry[];
}): FileModel {
  const { patch, generated, order, fileOrder, viewedEvents, findings } = params;

  const explicitOrder = fileOrder !== undefined && fileOrder.length > 0;
  const allEntries =
    fileOrder && fileOrder.length > 0
      ? orderByFiles(parseFiles(patch), fileOrder)
      : sortEntries(parseFiles(patch), order);
  const entryById = new Map(allEntries.map((entry) => [entry.id, entry]));

  const classes = classifyFiles(patch, generated);
  function classFor(id: string): FileClass {
    return classes.get(id) ?? NORMAL_CLASS;
  }

  // Generated and pure-rename files auto-mark-viewed: the fold starts them
  // from a viewed baseline, still counted in progress but un-viewable.
  const viewedModel = computeViewed(viewedEvents, allEntries, (entry) =>
    autoViewed(classFor(entry.id))
  );
  const findingPaths = new Set(
    sift(findings.map((finding) => finding.anchorFile))
  );

  return {
    allEntries,
    classFor,
    entryById,
    explicitOrder,
    findingPaths,
    viewedModel,
  };
}

export interface VisibleFiles {
  tree: TreeNode[];
  /** Depth-first, filtered — the order the tree and the scroll both render. */
  entries: FileEntry[];
  anchors: ChangeAnchor[];
}

/**
 * Narrow a file model to what the tree and scroll show: the substring filter
 * first, then the viewed / has-findings quick filters. Filtering both surfaces
 * from this one derivation keeps them in agreement.
 */
export function visibleFiles(
  model: FileModel,
  filters: {
    filter: string;
    unviewedOnly: boolean;
    findingsOnly: boolean;
  },
  isViewed: (id: string) => boolean
): VisibleFiles {
  const filtered = filterEntries(model.allEntries, filters.filter).filter(
    (entry) => {
      if (filters.unviewedOnly && isViewed(entry.id)) {
        return false;
      }
      if (filters.findingsOnly && !model.findingPaths.has(entry.path)) {
        return false;
      }
      return true;
    }
  );
  const tree = buildTree(filtered);
  const entries = flattenFiles(tree);
  const anchors = changeAnchors(entries);
  return { anchors, entries, tree };
}

/**
 * Per-row viewed read-out for the tree, spanning every file (rows for hidden
 * files are simply never rendered). `changed` shows only while unviewed;
 * `generated` de-emphasizes the row (diff-review.md §5).
 */
export function buildRowStates(
  entries: readonly FileEntry[],
  model: ViewedModel,
  isViewed: (id: string) => boolean,
  classFor: (id: string) => FileClass
): Map<string, RowState> {
  return new Map(
    entries.map((entry) => {
      const state = viewedStateFor(model, entry.id);
      const viewedNow = isViewed(entry.id);
      return [
        entry.id,
        {
          changed: state.changedSinceViewed && !viewedNow,
          generated: classFor(entry.id).generated,
          viewed: viewedNow,
        },
      ];
    })
  );
}

/** Count of files currently viewed — the progress read-out's numerator. */
export function countViewed(
  entries: readonly FileEntry[],
  isViewed: (id: string) => boolean
): number {
  return entries.reduce(
    (total, entry) => total + (isViewed(entry.id) ? 1 : 0),
    0
  );
}
