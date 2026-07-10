import type {
  CodeViewDiffItem,
  CodeViewItem,
  CodeViewLineSelection,
  DiffLineAnnotation,
  FileDiffMetadata,
  LineAnnotation,
} from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { CodeView, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { sift } from "radashi";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { FindingEntry, ViewedEvent } from "../shared/dossier.ts";
import type { FindingWrite } from "../shared/finding-write.ts";
import { fetchExpandedFileDiff, isExpandable } from "./blobs.ts";
import type { Annotation } from "./diff-annotations.ts";
import { FileTree } from "./file-tree.tsx";
import type { RowState } from "./file-tree.tsx";
import {
  buildTree,
  changeAnchors,
  filterEntries,
  flattenFiles,
  parseFiles,
  sortEntries,
  stepChange,
  stepFile,
} from "./nav.ts";
import type { FileEntry, FileOrder } from "./nav.ts";
import { useDiffFindings } from "./use-diff-findings.tsx";
import { computeViewed, viewedStateFor } from "./viewed.ts";

const themes = { dark: "github-dark", light: "github-light" } as const;

// Keyboard jumps — [ ] step files, , . step changes.
const KEY_ACTIONS: Record<string, ["file" | "change", 1 | -1]> = {
  ",": ["change", -1],
  ".": ["change", 1],
  "[": ["file", -1],
  "]": ["file", 1],
};

// One Shiki-tokenizing worker per hardware thread (capped). Tokenization must
// stay off the main thread: the #4 re-benchmark measured worker-off scroll at
// p95 225 ms with 15 long frames vs. zero with the pool on.
function workerFactory() {
  return new Worker(new URL("@pierre/diffs/worker/worker.js", import.meta.url), {
    type: "module",
  });
}

/** A localStorage-backed preference, so layout/order survive reloads. */
function usePersisted<T extends string>(
  key: string,
  initial: T,
  decode: (raw: string) => T | undefined,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = globalThis.localStorage?.getItem(key);
    return (raw === null || raw === undefined ? undefined : decode(raw)) ?? initial;
  });
  function set(next: T) {
    setValue(next);
    globalThis.localStorage?.setItem(key, next);
  }
  return [value, set];
}

/** The imperative surface the Findings panel drives to jump into the diff. */
export interface DiffViewHandle {
  scrollToLine: (file: string, line: number) => void;
}

/**
 * The sticky file-header metadata (diff-review.md §3): the "changed since
 * viewed" flag, the context-expansion affordance for a both-sided partial file,
 * and the manual Viewed checkbox that collapses the body when checked.
 */
function HeaderMetadata({
  item,
  row,
  busy,
  isFileExpandable,
  onComment,
  onToggleViewed,
  onExpandContext,
}: {
  item: CodeViewDiffItem<Annotation>;
  row: RowState | undefined;
  busy: boolean;
  isFileExpandable: (fileDiff: FileDiffMetadata) => boolean;
  onComment?: (item: CodeViewDiffItem<Annotation>) => void;
  onToggleViewed: (id: string) => void;
  onExpandContext: (id: string, fileDiff: FileDiffMetadata) => void;
}) {
  return (
    <span style={{ alignItems: "center", display: "inline-flex", gap: "0.6rem" }}>
      {row?.changed ? <span className="viewed-changed">changed since viewed</span> : null}
      {onComment ? (
        <button className="expand-context" onClick={() => onComment(item)} type="button">
          Comment
        </button>
      ) : null}
      {isFileExpandable(item.fileDiff) ? (
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

/** Post a mark-as-viewed toggle, throwing on a non-2xx so the caller can roll back. */
async function postViewed(entry: FileEntry): Promise<void> {
  const res = await fetch("/api/viewed", {
    body: JSON.stringify({ blobSha: entry.blobSha, path: entry.path }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`POST /api/viewed failed: HTTP ${res.status}`);
  }
}

/**
 * The right-hand diff pane: the whole-branch diff rendered as one continuous
 * virtualized cross-file scroll. Split out of DiffView so the tab's model/nav
 * logic and the renderer plumbing stay separately legible; all state still lives
 * in DiffView and reaches here as props.
 */
function DiffScroll({
  codeRef,
  expanding,
  isFileExpandable,
  items,
  onComment,
  onExpandContext,
  onScroll,
  onSelectedLinesChange,
  onToggleViewed,
  renderAnnotation,
  rowStates,
  selectionEnabled,
  split,
}: {
  codeRef: React.RefObject<CodeViewHandle<Annotation> | null>;
  expanding: ReadonlySet<string>;
  isFileExpandable: (fileDiff: FileDiffMetadata) => boolean;
  items: CodeViewItem<Annotation>[];
  onComment?: (item: CodeViewDiffItem<Annotation>) => void;
  onExpandContext: (id: string, fileDiff: FileDiffMetadata) => void;
  onScroll: (
    scrollTop: number,
    viewer: NonNullable<ReturnType<CodeViewHandle<Annotation>["getInstance"]>>,
  ) => void;
  onSelectedLinesChange: (selection: CodeViewLineSelection | null) => void;
  onToggleViewed: (id: string) => void;
  renderAnnotation: (
    annotation: DiffLineAnnotation<Annotation> | LineAnnotation<Annotation>,
  ) => React.ReactNode;
  rowStates: Map<string, { viewed: boolean; changed: boolean }>;
  selectionEnabled: boolean;
  split: "unified" | "split";
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <WorkerPoolContextProvider
        highlighterOptions={{ theme: themes, useTokenTransformer: true }}
        poolOptions={{
          poolSize: Math.min(8, navigator.hardwareConcurrency || 4),
          workerFactory,
        }}
      >
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
                busy={expanding.has(item.id)}
                isFileExpandable={isFileExpandable}
                item={item}
                onComment={onComment}
                onExpandContext={onExpandContext}
                onToggleViewed={onToggleViewed}
                row={rowStates.get(item.id)}
              />
            ) : null
          }
          // CodeView must be its own scroll container: its virtualizer reads
          // this element's scrollTop, not an ancestor's. An outer scrolling
          // wrapper breaks both scrolling and virtualization.
          style={{ height: "100%", overflow: "auto" }}
        />
      </WorkerPoolContextProvider>
    </div>
  );
}

/**
 * The Diff tab: the compact-folder navigation tree beside the whole branch
 * diff rendered as one continuous virtualized cross-file scroll. The tree and
 * the scroll share a single ordered file model, so position stays in sync.
 *
 * Mark-as-viewed (diff-review.md §3) rides on that same model: each file's
 * head-blob SHA folds the Dossier's append-only viewed events into per-file
 * viewed state, which collapses the file body, checks the tree row, and drives
 * the progress read-model. Toggling posts an event and optimistically overlays
 * the fold until the SSE snapshot catches up.
 *
 * Context expansion is pluggable so the same surface renders both a committed
 * Change (both sides from `/api/blob/:sha`) and the Pending working-tree preview
 * (head side from `/api/worktree`). Defaults are the committed-Change fetchers.
 */
export function DiffView({
  patch,
  viewed,
  findings,
  onWrite,
  ref,
  expandFile = fetchExpandedFileDiff,
  isFileExpandable = isExpandable,
}: {
  patch: string;
  viewed: readonly ViewedEvent[];
  findings: readonly FindingEntry[];
  /** Absent on the read-only Pending preview, which disables authoring. */
  onWrite?: (write: FindingWrite) => Promise<void>;
  ref?: React.Ref<DiffViewHandle>;
  expandFile?: (fileDiff: FileDiffMetadata) => Promise<FileDiffMetadata>;
  isFileExpandable?: (fileDiff: FileDiffMetadata) => boolean;
}) {
  const [filter, setFilter] = useState("");
  const [unviewedOnly, setUnviewedOnly] = useState(false);
  const [findingsOnly, setFindingsOnly] = useState(false);
  const [order, setOrder] = usePersisted<FileOrder>("docent:fileOrder", "path", (raw) =>
    raw === "size" || raw === "path" ? raw : undefined,
  );
  const [split, setSplit] = usePersisted<"unified" | "split">(
    "docent:diffStyle",
    "unified",
    (raw) => (raw === "split" || raw === "unified" ? raw : undefined),
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [activeId, setActiveId] = useState<string | undefined>();
  // Optimistic viewed overrides, keyed by file id and stamped with the head
  // blob the toggle asserted against, so the checkbox and collapse respond
  // instantly ahead of the watch → SSE → re-fetch round trip. Blob-stamping
  // makes the override self-invalidating: once a new Change gives the file a
  // different head blob, the stamp no longer matches and the fold's cleared /
  // changed-since-viewed state shows through — no reconcile pass needed.
  const [viewedOverlay, setViewedOverlay] = useState<
    ReadonlyMap<string, { viewed: boolean; blobSha: string }>
  >(new Map());
  // Files whose full base/head blobs have been lazily fetched, keyed by item
  // id. A present entry is a non-partial diff that the renderer can expand;
  // `expanding` holds ids with a fetch in flight so the affordance can't
  // double-fire.
  const [expanded, setExpanded] = useState<ReadonlyMap<string, FileDiffMetadata>>(new Map());
  const [expanding, setExpanding] = useState<ReadonlySet<string>>(new Set());

  const codeRef = useRef<CodeViewHandle<Annotation>>(null);

  // The single ordered file model both surfaces read from. `allEntries` is every
  // file in the Change (the viewed read-model and progress span all of them);
  // filtering narrows what the tree and scroll show. React Compiler memoizes
  // these derivations, so no manual useMemo is needed.
  const allEntries = sortEntries(parseFiles(patch), order);
  const entryById = new Map(allEntries.map((entry) => [entry.id, entry]));
  const model = computeViewed(viewed, allEntries);
  // Anchored files, from the finding fold — the has-findings quick filter.
  const findingPaths = new Set(sift(findings.map((finding) => finding.anchorFile)));

  function isViewed(id: string): boolean {
    const override = viewedOverlay.get(id);
    if (override !== undefined && override.blobSha === entryById.get(id)?.blobSha) {
      return override.viewed;
    }
    return viewedStateFor(model, id).viewed;
  }

  // Substring filter first (nav's own), then the viewed / findings quick
  // filters. Filtering both the tree and the scroll keeps them in agreement.
  const visible = filterEntries(allEntries, filter).filter((entry) => {
    if (unviewedOnly && isViewed(entry.id)) {
      return false;
    }
    if (findingsOnly && !findingPaths.has(entry.path)) {
      return false;
    }
    return true;
  });
  const tree = buildTree(visible);
  const entries = flattenFiles(tree);
  const anchors = changeAnchors(entries);

  // Per-row viewed state for the tree, spanning every file (rows for hidden
  // files are simply never rendered). `changed` shows only while unviewed.
  const rowStates = new Map<string, { viewed: boolean; changed: boolean }>(
    allEntries.map((entry) => {
      const state = viewedStateFor(model, entry.id);
      const viewedNow = isViewed(entry.id);
      return [entry.id, { changed: state.changedSinceViewed && !viewedNow, viewed: viewedNow }];
    }),
  );
  const viewedCount = allEntries.reduce((total, entry) => total + (isViewed(entry.id) ? 1 : 0), 0);

  // The diff's Finding layer: the annotated item list, the inline thread/composer
  // renderer, and the compose lifecycle. A viewed file collapses its body and an
  // expanded file gains context; the item `version` folds those with the
  // annotations so CodeView re-renders on any of them.
  const { canAuthor, compose, items, renderAnnotation } = useDiffFindings({
    codeRef,
    entries,
    expanded,
    findings,
    isViewed,
    onWrite,
    patch,
  });

  function toggleViewed(id: string) {
    const entry = entryById.get(id);
    if (entry === undefined) {
      return;
    }

    const next = !isViewed(id);
    setViewedOverlay((prev) => new Map(prev).set(id, { blobSha: entry.blobSha, viewed: next }));
    void postViewed(entry).catch(() => {
      // The write failed, so nothing persisted: drop the override and let the
      // checkbox fall back to the fold rather than lie about a saved toggle.
      setViewedOverlay((prev) => {
        const rolledBack = new Map(prev);
        rolledBack.delete(id);
        return rolledBack;
      });
    });
  }

  function scrollToId(id: string) {
    codeRef.current?.scrollTo({ behavior: "smooth", id, type: "item" });
    setActiveId(id);
  }

  // Jump the scroll to a Finding's anchored file/line. The item id encodes the
  // file's index in the patch (`name#index`), so a Finding anchor — which knows
  // only the path — is resolved against the parsed patch here, where that index
  // lives. A file the diff no longer contains (an outdated Finding) is a no-op.
  function scrollToLine(file: string, line: number) {
    const index = processPatch(patch).files.findIndex((fileDiff) => fileDiff.name === file);
    if (index === -1) {
      return;
    }
    const id = `${file}#${index}`;
    codeRef.current?.scrollTo({ behavior: "smooth", id, lineNumber: line, type: "line" });
    setActiveId(id);
  }
  useImperativeHandle(ref, () => ({ scrollToLine }));

  // Two-way sync: the scroll drives the active file. The active file is the
  // last item whose top has passed the viewport top.
  function handleScroll(
    scrollTop: number,
    viewer: NonNullable<ReturnType<CodeViewHandle<Annotation>["getInstance"]>>,
  ) {
    let current: string | undefined;
    for (const item of items) {
      const top = viewer.getTopForItem(item.id);
      if (top !== undefined && top <= scrollTop + 8) {
        current = item.id;
      } else if (top !== undefined) {
        break;
      }
    }
    if (current !== undefined) {
      setActiveId((prev) => (prev === current ? prev : current));
    }
  }

  function jump(kind: "file" | "change", direction: 1 | -1) {
    if (kind === "file") {
      const next = stepFile(
        entries.map((e) => e.id),
        activeId,
        direction,
      );
      if (next !== undefined) {
        scrollToId(next);
      }
      return;
    }
    const currentIndex = Math.max(
      anchors.findIndex((a) => a.fileId === activeId),
      0,
    );
    const nextIndex = stepChange(anchors.length, currentIndex, direction);
    const anchor = anchors[nextIndex];
    if (anchor === undefined) {
      return;
    }
    codeRef.current?.scrollTo({
      behavior: "smooth",
      id: anchor.fileId,
      lineNumber: anchor.lineNumber,
      type: "line",
    });
    setActiveId(anchor.fileId);
  }

  // Lazy context expansion: a patch-only file is `isPartial`, so the renderer
  // hides its own hunk-expansion controls. The reviewer clicks "Expand
  // context", we fetch that file's full base/head blobs from `/api/blob/:sha`,
  // and swap in the non-partial diff — only then does the renderer expose
  // hunk/whole-file expansion. Fetching is per-file and on demand, never eager.
  function expandContext(id: string, fileDiff: FileDiffMetadata) {
    setExpanding((prev) => new Set(prev).add(id));
    void expandFile(fileDiff)
      .then((full) => {
        setExpanded((prev) => new Map(prev).set(id, full));
      })
      .catch(() => {
        // Best-effort: leave the file partial on a failed blob fetch.
      })
      .finally(() => {
        setExpanding((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  }

  function toggleDir(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  // The keydown listener subscribes once; a ref keeps it pointed at the latest
  // jump so it sees current state without React Compiler's per-render identity
  // churning the effect (and re-adding the listener) every render.
  const jumpRef = useRef(jump);
  useEffect(() => {
    jumpRef.current = jump;
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const { target } = event;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      const action = KEY_ACTIONS[event.key];
      if (action) {
        event.preventDefault();
        jumpRef.current(action[0], action[1]);
      }
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <FileTree
        activeId={activeId}
        collapsed={collapsed}
        filter={filter}
        findingsOnly={findingsOnly}
        nodes={tree}
        onFilterChange={setFilter}
        onFindingsOnlyChange={setFindingsOnly}
        onJump={jump}
        onOrderChange={setOrder}
        onSelect={scrollToId}
        onSplitChange={(next) => setSplit(next ? "split" : "unified")}
        onToggleDir={toggleDir}
        onToggleViewed={toggleViewed}
        onUnviewedOnlyChange={setUnviewedOnly}
        order={order}
        progress={{ total: allEntries.length, viewed: viewedCount }}
        rowStates={rowStates}
        split={split === "split"}
        unviewedOnly={unviewedOnly}
      />
      <DiffScroll
        codeRef={codeRef}
        expanding={expanding}
        isFileExpandable={isFileExpandable}
        items={items}
        onComment={canAuthor ? (item) => compose.commentOnFile(item.id, item.fileDiff) : undefined}
        onExpandContext={expandContext}
        onScroll={handleScroll}
        onSelectedLinesChange={(selection) => compose.selectLines(selection)}
        onToggleViewed={toggleViewed}
        renderAnnotation={renderAnnotation}
        rowStates={rowStates}
        selectionEnabled={canAuthor}
        split={split}
      />
    </div>
  );
}
