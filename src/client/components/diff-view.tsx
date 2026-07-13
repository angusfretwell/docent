import type {
  CodeViewDiffItem,
  CodeViewItem,
  CodeViewLineSelection,
  DiffLineAnnotation,
  FileDiffMetadata,
  LineAnnotation,
} from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { CodeView } from "@pierre/diffs/react";
import type { FindingWrite } from "@shared/schemas/finding-write";
import type { FindingEntry, ViewedEvent } from "@shared/schemas/review";
import { useRef, useState } from "react";

import { fetchExpandedFileDiff } from "../data/blobs";
import { useViewedState } from "../data/viewed";
import { useContextExpansion } from "../hooks/use-context-expansion";
import { useDiffFindings } from "../hooks/use-diff-findings";
import { useDiffNav } from "../hooks/use-diff-nav";
import { usePersisted } from "../hooks/use-persisted";
import { isExpandable } from "../lib/blobs";
import { themes } from "../lib/code-view";
import type { Annotation } from "../lib/diff-annotations";
import type { DriftResult } from "../lib/drift";
import { bodyReplaced } from "../lib/edge-cases";
import type { FileClass } from "../lib/edge-cases";
import {
  buildFileModel,
  buildRowStates,
  countViewed,
  visibleFiles,
} from "../lib/file-model";
import type { FileOrder } from "../lib/nav";
import { toggleInSet } from "../lib/set";
import { CodeViewWorkerPool } from "./code-view-worker-pool";
import { EdgeChrome } from "./edge-chrome";
import { FileTree } from "./file-tree";
import type { RowState, ViewedRows } from "./file-tree";

/** The imperative surface the Findings panel and the walkthrough tab drive to jump into the diff. */
export interface DiffViewHandle {
  /** Scroll to a file's line on the given side (default head/additions). */
  scrollToLine: (file: string, line: number, side?: "base" | "head") => void;
}

// A stable empty generated list, so the pre-snapshot render doesn't churn the
// classification derivation.
const NO_GENERATED: readonly string[] = [];

/**
 * The sticky file-header metadata (diff-review.md §3): the "changed since
 * viewed" flag, the context-expansion affordance for a both-sided partial file,
 * and the manual Viewed checkbox that collapses the body when checked.
 */
function HeaderMetadata({
  item,
  row,
  file,
  busy,
  largeLoaded,
  isFileExpandable,
  onComment,
  onToggleViewed,
  onToggleLarge,
  onExpandContext,
}: {
  item: CodeViewDiffItem<Annotation>;
  row: RowState | undefined;
  file: FileClass;
  busy: boolean;
  largeLoaded: boolean;
  isFileExpandable: (fileDiff: FileDiffMetadata) => boolean;
  onComment?: (item: CodeViewDiffItem<Annotation>) => void;
  onToggleViewed: (id: string) => void;
  onToggleLarge: (id: string) => void;
  onExpandContext: (id: string, fileDiff: FileDiffMetadata) => void;
}) {
  // Binary/image/mode/submodule bodies are replaced by the edge chrome, so
  // their patch-only "context" is meaningless — never offer to expand it.
  const canExpand = !bodyReplaced(file) && isFileExpandable(item.fileDiff);
  return (
    <span
      style={{ alignItems: "center", display: "inline-flex", gap: "0.6rem" }}
    >
      <EdgeChrome
        file={file}
        item={item.fileDiff}
        largeLoaded={largeLoaded}
        onToggleLarge={() => onToggleLarge(item.id)}
      />
      {row?.changed ? (
        <span className="text-[0.7rem] uppercase tracking-wide text-warning-foreground">
          changed since viewed
        </span>
      ) : null}
      {onComment ? (
        <button
          className="expand-context"
          onClick={() => onComment(item)}
          type="button"
        >
          Comment
        </button>
      ) : null}
      {canExpand ? (
        <button
          className="expand-context"
          disabled={busy}
          onClick={() => onExpandContext(item.id, item.fileDiff)}
          type="button"
        >
          {busy ? "Expanding…" : "Expand context"}
        </button>
      ) : null}
      <label className="viewed-toggle">
        <input
          checked={row?.viewed ?? false}
          onChange={() => onToggleViewed(item.id)}
          type="checkbox"
        />
        Viewed
      </label>
    </span>
  );
}

/**
 * The right-hand diff pane: the whole-branch diff rendered as one continuous
 * virtualized cross-file scroll. Split out of DiffView so the tab's model/nav
 * logic and the renderer plumbing stay separately legible; all state still lives
 * in DiffView and reaches here as props.
 */
function DiffScroll({
  codeRef,
  classFor,
  expansion,
  items,
  largeLoaded,
  onComment,
  onScroll,
  onSelectedLinesChange,
  onToggleLarge,
  renderAnnotation,
  selectionEnabled,
  split,
  viewed,
}: {
  codeRef: React.RefObject<CodeViewHandle<Annotation> | null>;
  classFor: (id: string) => FileClass;
  /** The lazy-context-expansion surface: fetch gating, in-flight ids, and the fetch trigger. */
  expansion: {
    isFileExpandable: (fileDiff: FileDiffMetadata) => boolean;
    expanding: ReadonlySet<string>;
    onExpand: (id: string, fileDiff: FileDiffMetadata) => void;
  };
  items: CodeViewItem<Annotation>[];
  largeLoaded: ReadonlySet<string>;
  onComment?: (item: CodeViewDiffItem<Annotation>) => void;
  onScroll: (
    scrollTop: number,
    viewer: NonNullable<ReturnType<CodeViewHandle<Annotation>["getInstance"]>>
  ) => void;
  onSelectedLinesChange: (selection: CodeViewLineSelection | null) => void;
  onToggleLarge: (id: string) => void;
  renderAnnotation: (
    annotation: DiffLineAnnotation<Annotation> | LineAnnotation<Annotation>
  ) => React.ReactNode;
  selectionEnabled: boolean;
  split: "unified" | "split";
  viewed: ViewedRows;
}) {
  const { onExpand: onExpandContext } = expansion;
  const { onToggleViewed } = viewed;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <CodeViewWorkerPool>
        <CodeView
          items={items}
          onScroll={onScroll}
          onSelectedLinesChange={onSelectedLinesChange}
          options={{
            diffStyle: split,
            enableLineSelection: selectionEnabled,
            stickyHeaders: true,
            theme: themes,
          }}
          ref={codeRef}
          renderAnnotation={renderAnnotation}
          renderHeaderMetadata={(item) =>
            item.type === "diff" ? (
              <HeaderMetadata
                busy={expansion.expanding.has(item.id)}
                file={classFor(item.id)}
                isFileExpandable={expansion.isFileExpandable}
                item={item}
                largeLoaded={largeLoaded.has(item.id)}
                onComment={onComment}
                onExpandContext={onExpandContext}
                onToggleLarge={onToggleLarge}
                onToggleViewed={onToggleViewed}
                row={viewed.rowStates.get(item.id)}
              />
            ) : null
          }
          // CodeView must be its own scroll container: its virtualizer reads
          // this element's scrollTop, not an ancestor's. An outer scrolling
          // wrapper breaks both scrolling and virtualization.
          style={{ height: "100%", overflow: "auto" }}
        />
      </CodeViewWorkerPool>
    </div>
  );
}

/**
 * The Diff tab: the compact-folder navigation tree beside the whole branch
 * diff rendered as one continuous virtualized cross-file scroll. The tree and
 * the scroll share a single ordered file model (`lib/file-model.ts`), so
 * position stays in sync.
 *
 * Mark-as-viewed (diff-review.md §3) rides on that same model: each file's
 * head-blob SHA folds the Review's append-only viewed events into per-file
 * viewed state, which collapses the file body, checks the tree row, and drives
 * the progress read-model. `useViewedState` overlays a toggle's effect
 * optimistically ahead of the watch → SSE → re-fetch round trip.
 *
 * Context expansion (`useContextExpansion`) is pluggable so the same surface
 * renders both a committed Change (both sides from `/api/blob/:sha`) and the
 * Pending working-tree preview (head side from `/api/worktree`). Defaults are
 * the committed-Change fetchers. Cross-file navigation — the active file, the
 * `[ ] , .` keyboard jumps, and the imperative scroll-to-line handle — lives in
 * `useDiffNav`.
 */
export function DiffView({
  patch,
  viewed,
  findings,
  generated = NO_GENERATED,
  onWrite,
  ref,
  drift,
  expandFile = fetchExpandedFileDiff,
  isFileExpandable = isExpandable,
  fileOrder,
  onExitFileOrder,
}: {
  patch: string;
  viewed: readonly ViewedEvent[];
  findings: readonly FindingEntry[];
  /** Server-side `.gitattributes` generated paths, unioned with the glob set. */
  generated?: readonly string[];
  /** Absent on the read-only Pending preview, which disables authoring. */
  onWrite?: (write: FindingWrite) => Promise<void>;
  ref?: React.Ref<DiffViewHandle>;
  /** Per-Finding drift; absent on Pending, where the sync fast path stands in. */
  drift?: ReadonlyMap<string, DriftResult>;
  expandFile?: (fileDiff: FileDiffMetadata) => Promise<FileDiffMetadata>;
  isFileExpandable?: (fileDiff: FileDiffMetadata) => boolean;
  /**
   * An explicit walkthrough-order file list (diff-review.md §2). When set it
   * wins over the path/size toggle, so "open Diff tab in walkthrough order"
   * lands the scroll and tree in the tour's file sequence.
   */
  fileOrder?: readonly string[];
  /** Drops the explicit order upstream when the reviewer picks a path/size sort. */
  onExitFileOrder?: () => void;
}) {
  const [filter, setFilter] = useState("");
  // Ids of oversized/minified files the reviewer clicked "Load diff" on, so the
  // collapsed body reveals — local, transient state (no persistence needed).
  const [largeLoaded, setLargeLoaded] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [unviewedOnly, setUnviewedOnly] = useState(false);
  const [findingsOnly, setFindingsOnly] = useState(false);
  const [order, setOrder] = usePersisted<FileOrder>(
    "docent:fileOrder",
    "path",
    (raw) => (raw === "size" || raw === "path" ? raw : undefined)
  );
  const [split, setSplit] = usePersisted<"unified" | "split">(
    "docent:diffStyle",
    "unified",
    (raw) => (raw === "split" || raw === "unified" ? raw : undefined)
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const codeRef = useRef<CodeViewHandle<Annotation>>(null);

  // The single ordered file model both surfaces read from (lib/file-model.ts):
  // `allEntries` is every file in the Change (the viewed read-model and
  // progress span all of them); filtering narrows what the tree and scroll
  // show. An explicit walkthrough order, when present, wins over the
  // path/size toggle.
  const fileModel = buildFileModel({
    fileOrder,
    findings,
    generated,
    order,
    patch,
    viewedEvents: viewed,
  });
  const { isViewed, toggleViewed } = useViewedState(
    fileModel.entryById,
    fileModel.viewedModel
  );

  // Substring filter first (nav's own), then the viewed / findings quick
  // filters. Filtering both the tree and the scroll keeps them in agreement.
  const { anchors, entries, tree } = visibleFiles(
    fileModel,
    { filter, findingsOnly, unviewedOnly },
    isViewed
  );

  const rowStates = buildRowStates(
    fileModel.allEntries,
    fileModel.viewedModel,
    isViewed,
    fileModel.classFor
  );
  const viewedCount = countViewed(fileModel.allEntries, isViewed);

  // A file's body collapses when it is an edge case whose body is replaced by
  // header chrome (binary/image/mode/submodule) or an oversized/minified file
  // not yet loaded via "Load diff" (diff-review.md §5). Folded into the item's
  // collapse alongside viewed state below.
  function isEdgeCollapsed(id: string): boolean {
    const cls = fileModel.classFor(id);
    return bodyReplaced(cls) || (cls.large && !largeLoaded.has(id));
  }

  const { expanded, expanding, expandContext } =
    useContextExpansion(expandFile);

  // The diff's Finding layer: the annotated item list, the inline thread/composer
  // renderer, and the compose lifecycle. A viewed or edge-collapsed file collapses
  // its body and an expanded file gains context; the item `version` folds those
  // with the annotations so CodeView re-renders on any of them.
  const { canAuthor, compose, items, renderAnnotation } = useDiffFindings({
    codeRef,
    drift,
    entries,
    expanded,
    findings,
    isEdgeCollapsed,
    isViewed,
    onWrite,
    patch,
  });

  const { activeId, handleScroll, jump, scrollToId } = useDiffNav({
    anchors,
    codeRef,
    entries,
    items,
    patch,
    ref,
  });

  // Reveal or re-collapse an oversized/minified file's body (diff-review.md §5).
  function toggleLarge(id: string) {
    setLargeLoaded((prev) => toggleInSet(prev, id));
  }

  function toggleDir(path: string) {
    setCollapsed((prev) => toggleInSet(prev, path));
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <FileTree
        collapsed={collapsed}
        explicitOrder={fileModel.explicitOrder}
        filter={filter}
        findingsOnly={findingsOnly}
        nav={{ activeId, onJump: jump, onSelect: scrollToId }}
        nodes={tree}
        onFilterChange={setFilter}
        onFindingsOnlyChange={setFindingsOnly}
        onOrderChange={(next) => {
          onExitFileOrder?.();
          setOrder(next);
        }}
        onSplitChange={(next) => setSplit(next ? "split" : "unified")}
        onToggleDir={toggleDir}
        onUnviewedOnlyChange={setUnviewedOnly}
        order={order}
        progress={{ total: fileModel.allEntries.length, viewed: viewedCount }}
        split={split === "split"}
        unviewedOnly={unviewedOnly}
        viewed={{ onToggleViewed: toggleViewed, rowStates }}
      />
      <DiffScroll
        classFor={fileModel.classFor}
        codeRef={codeRef}
        expansion={{
          expanding,
          isFileExpandable,
          onExpand: expandContext,
        }}
        items={items}
        largeLoaded={largeLoaded}
        onComment={
          canAuthor
            ? (item) => compose.commentOnFile(item.id, item.fileDiff)
            : undefined
        }
        onScroll={handleScroll}
        onSelectedLinesChange={(selection) => compose.selectLines(selection)}
        onToggleLarge={toggleLarge}
        renderAnnotation={renderAnnotation}
        selectionEnabled={canAuthor}
        split={split}
        viewed={{ onToggleViewed: toggleViewed, rowStates }}
      />
    </div>
  );
}
