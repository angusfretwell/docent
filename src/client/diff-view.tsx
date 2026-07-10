import type { CodeViewDiffItem, CodeViewItem, FileDiffMetadata } from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { CodeView, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { sift } from "radashi";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { FindingEntry, ViewedEvent } from "../shared/dossier.ts";
import { fetchExpandedFileDiff, isExpandable } from "./blobs.ts";
import { EdgeChrome } from "./edge-chrome.tsx";
import { autoViewed, bodyReplaced, classifyFiles } from "./edge-cases.ts";
import type { FileClass } from "./edge-cases.ts";
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
import { computeViewed, viewedStateFor } from "./viewed.ts";
import type { ViewedModel } from "./viewed.ts";

const themes = { dark: "github-dark", light: "github-light" } as const;

// Keyboard jumps — [ ] step files, , . step changes.
const KEY_ACTIONS: Record<string, ["file" | "change", 1 | -1]> = {
  ",": ["change", -1],
  ".": ["change", 1],
  "[": ["file", -1],
  "]": ["file", 1],
};

/**
 * Bind the `[ ] , .` file/change jump keys to the latest `jump`. The listener
 * subscribes once; a ref keeps it pointed at the current closure so React
 * Compiler's per-render identity doesn't churn the effect (and re-add the
 * listener) every render. Typing in an input/textarea is left alone.
 */
function useJumpKeys(jump: (kind: "file" | "change", direction: 1 | -1) => void) {
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
}

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

// A stable empty generated list, so the pre-snapshot render doesn't churn the
// classification derivation.
const NO_GENERATED: readonly string[] = [];

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
  onToggleViewed,
  onToggleLarge,
  onExpandContext,
}: {
  item: CodeViewDiffItem;
  row: RowState | undefined;
  file: FileClass;
  busy: boolean;
  largeLoaded: boolean;
  isFileExpandable: (fileDiff: FileDiffMetadata) => boolean;
  onToggleViewed: (id: string) => void;
  onToggleLarge: (id: string) => void;
  onExpandContext: (id: string, fileDiff: FileDiffMetadata) => void;
}) {
  // Binary/image/mode/submodule bodies are replaced by the edge chrome, so
  // their patch-only "context" is meaningless — never offer to expand it.
  const canExpand = !bodyReplaced(file) && isFileExpandable(item.fileDiff);
  return (
    <span style={{ alignItems: "center", display: "inline-flex", gap: "0.6rem" }}>
      <EdgeChrome
        file={file}
        item={item.fileDiff}
        largeLoaded={largeLoaded}
        onToggleLarge={() => onToggleLarge(item.id)}
      />
      {row?.changed ? <span className="viewed-changed">changed since viewed</span> : null}
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
  classFor,
  expanding,
  isFileExpandable,
  items,
  largeLoaded,
  onExpandContext,
  onScroll,
  onToggleLarge,
  onToggleViewed,
  rowStates,
  split,
}: {
  codeRef: React.RefObject<CodeViewHandle<undefined> | null>;
  classFor: (id: string) => FileClass;
  expanding: ReadonlySet<string>;
  isFileExpandable: (fileDiff: FileDiffMetadata) => boolean;
  items: CodeViewItem[];
  largeLoaded: ReadonlySet<string>;
  onExpandContext: (id: string, fileDiff: FileDiffMetadata) => void;
  onScroll: (
    scrollTop: number,
    viewer: NonNullable<ReturnType<CodeViewHandle<undefined>["getInstance"]>>,
  ) => void;
  onToggleLarge: (id: string) => void;
  onToggleViewed: (id: string) => void;
  rowStates: Map<string, RowState>;
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
          options={{ diffStyle: split, stickyHeaders: true, theme: themes }}
          ref={codeRef}
          renderHeaderMetadata={(item) =>
            item.type === "diff" ? (
              <HeaderMetadata
                busy={expanding.has(item.id)}
                file={classFor(item.id)}
                isFileExpandable={isFileExpandable}
                item={item}
                largeLoaded={largeLoaded.has(item.id)}
                onExpandContext={onExpandContext}
                onToggleLarge={onToggleLarge}
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
 * Per-row viewed read-out for the tree, spanning every file (rows for hidden
 * files are simply never rendered). `changed` shows only while unviewed;
 * `generated` de-emphasizes the row (diff-review.md §5).
 */
function buildRowStates(
  entries: readonly FileEntry[],
  model: ViewedModel,
  isViewed: (id: string) => boolean,
  classFor: (id: string) => FileClass,
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
    }),
  );
}

/**
 * Build the CodeView items for the ordered entries. A lazily-fetched full diff
 * wins over the patch-only one, so an expanded file renders with context. The
 * body collapses when the file is viewed, when it is an edge case whose body is
 * replaced by header chrome (binary/image/mode/submodule), or when it is
 * oversized and not yet loaded (diff-review.md §5). CodeView only re-renders an
 * item when its version changes, so each (expanded, collapsed) combination gets
 * a distinct version.
 */
function buildDiffItems({
  entries,
  byName,
  expanded,
  largeLoaded,
  isViewed,
  classFor,
}: {
  entries: readonly FileEntry[];
  byName: ReadonlyMap<string, FileDiffMetadata>;
  expanded: ReadonlyMap<string, FileDiffMetadata>;
  largeLoaded: ReadonlySet<string>;
  isViewed: (id: string) => boolean;
  classFor: (id: string) => FileClass;
}): CodeViewItem[] {
  return entries.flatMap((entry) => {
    const fileDiff = expanded.get(entry.id) ?? byName.get(entry.id);
    if (!fileDiff) {
      return [];
    }
    const cls = classFor(entry.id);
    const largeCollapsed = cls.large && !largeLoaded.has(entry.id);
    const collapsedBody = isViewed(entry.id) || bodyReplaced(cls) || largeCollapsed;
    const version = (expanded.has(entry.id) ? 1 : 0) + (collapsedBody ? 2 : 0);
    return [{ collapsed: collapsedBody, fileDiff, id: entry.id, type: "diff" as const, version }];
  });
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
  generated = NO_GENERATED,
  ref,
  expandFile = fetchExpandedFileDiff,
  isFileExpandable = isExpandable,
}: {
  patch: string;
  viewed: readonly ViewedEvent[];
  findings: readonly FindingEntry[];
  /** Server-side `.gitattributes` generated paths, unioned with the glob set. */
  generated?: readonly string[];
  ref?: React.Ref<DiffViewHandle>;
  expandFile?: (fileDiff: FileDiffMetadata) => Promise<FileDiffMetadata>;
  isFileExpandable?: (fileDiff: FileDiffMetadata) => boolean;
}) {
  const [filter, setFilter] = useState("");
  // Ids of oversized/minified files the reviewer clicked "Load diff" on, so the
  // collapsed body reveals — local, transient state (no persistence needed).
  const [largeLoaded, setLargeLoaded] = useState<ReadonlySet<string>>(new Set());
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

  const codeRef = useRef<CodeViewHandle<undefined>>(null);

  // The single ordered file model both surfaces read from. `allEntries` is every
  // file in the Change (the viewed read-model and progress span all of them);
  // filtering narrows what the tree and scroll show. React Compiler memoizes
  // these derivations, so no manual useMemo is needed.
  const allEntries = sortEntries(parseFiles(patch), order);
  const entryById = new Map(allEntries.map((entry) => [entry.id, entry]));
  // Per-file edge-case classification (diff-review.md §5), keyed by item id.
  const classes = classifyFiles(patch, generated);
  function classFor(id: string): FileClass {
    return classes.get(id) ?? NORMAL_CLASS;
  }
  // Generated and pure-rename files auto-mark-viewed: the fold starts them from
  // a viewed baseline, still counted in progress but un-viewable.
  const model = computeViewed(viewed, allEntries, (entry) => autoViewed(classFor(entry.id)));
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

  const rowStates = buildRowStates(allEntries, model, isViewed, classFor);
  const viewedCount = allEntries.reduce((total, entry) => total + (isViewed(entry.id) ? 1 : 0), 0);

  const byName = new Map(processPatch(patch).files.map((f, i) => [`${f.name}#${i}`, f]));
  const items = buildDiffItems({ byName, classFor, entries, expanded, isViewed, largeLoaded });

  // Reveal or re-collapse an oversized/minified file's body (diff-review.md §5).
  function toggleLarge(id: string) {
    setLargeLoaded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

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
    viewer: NonNullable<ReturnType<CodeViewHandle<undefined>["getInstance"]>>,
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

  useJumpKeys(jump);

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
        classFor={classFor}
        codeRef={codeRef}
        expanding={expanding}
        isFileExpandable={isFileExpandable}
        items={items}
        largeLoaded={largeLoaded}
        onExpandContext={expandContext}
        onScroll={handleScroll}
        onToggleLarge={toggleLarge}
        onToggleViewed={toggleViewed}
        rowStates={rowStates}
        split={split}
      />
    </div>
  );
}
