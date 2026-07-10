import type { CodeViewItem, FileDiffMetadata } from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { CodeView, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { useEffect, useRef, useState } from "react";
import type { FindingEntry, ViewedEvent } from "../shared/dossier.ts";
import { fetchExpandedFileDiff, isExpandable } from "./blobs.ts";
import { FileTree } from "./file-tree.tsx";
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

/** Post a mark-as-viewed toggle; best-effort — the SSE snapshot is the truth. */
function postViewed(entry: FileEntry): void {
  void fetch("/api/viewed", {
    body: JSON.stringify({ blobSha: entry.blobSha, path: entry.path }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }).catch(() => {
    // The optimistic overlay is reconciled from the next snapshot regardless.
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
 */
export function DiffView({
  patch,
  viewed,
  findings,
}: {
  patch: string;
  viewed: readonly ViewedEvent[];
  findings: readonly FindingEntry[];
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
  // Optimistic viewed overrides, keyed by file id: a toggle sets the intended
  // state here so the checkbox and collapse respond instantly, ahead of the
  // watch → SSE → re-fetch round trip. As the sole writer of viewed state (a
  // solo tool, diff-review.md §3) the overlay only ever mirrors the fold once
  // the snapshot lands, so it needs no reconcile pass; a reload clears it.
  const [viewedOverlay, setViewedOverlay] = useState<ReadonlyMap<string, boolean>>(new Map());
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
  const model = computeViewed(viewed, allEntries);
  // Anchored files, from the finding fold — the has-findings quick filter.
  const findingPaths = new Set(findings.flatMap((f) => (f.anchorFile ? [f.anchorFile] : [])));

  function isViewed(id: string): boolean {
    return viewedOverlay.get(id) ?? viewedStateFor(model, id).viewed;
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

  const byName = new Map(processPatch(patch).files.map((f, i) => [`${f.name}#${i}`, f]));
  // The lazily-fetched full diff wins over the patch-only one, so an expanded
  // file renders with context available. A viewed file collapses its body; the
  // version encodes both axes so CodeView re-renders the item on either change.
  const items: CodeViewItem[] = entries.flatMap((entry) => {
    const fileDiff = expanded.get(entry.id) ?? byName.get(entry.id);
    if (!fileDiff) {
      return [];
    }
    const collapsedBody = isViewed(entry.id);
    const version = (expanded.has(entry.id) ? 1 : 0) + (collapsedBody ? 2 : 0);
    return [{ collapsed: collapsedBody, fileDiff, id: entry.id, type: "diff" as const, version }];
  });

  function toggleViewed(id: string) {
    const entry = entryById.get(id);
    if (entry === undefined) {
      return;
    }
    const next = !isViewed(id);
    setViewedOverlay((prev) => new Map(prev).set(id, next));
    postViewed(entry);
  }

  function scrollToId(id: string) {
    codeRef.current?.scrollTo({ behavior: "smooth", id, type: "item" });
    setActiveId(id);
  }

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
    void fetchExpandedFileDiff(fileDiff)
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

  // The sticky file header carries the manual Viewed checkbox (diff-review.md
  // §3), the "changed since viewed" flag, and — for a both-sided partial file —
  // the context-expansion affordance.
  function renderHeaderMetadata(item: CodeViewItem) {
    if (item.type !== "diff") {
      return null;
    }
    const rowState = rowStates.get(item.id);
    const busy = expanding.has(item.id);
    return (
      <span style={{ alignItems: "center", display: "inline-flex", gap: "0.6rem" }}>
        {rowState?.changed ? <span className="viewed-changed">changed since viewed</span> : null}
        {isExpandable(item.fileDiff) ? (
          <button
            className="expand-context"
            disabled={busy}
            onClick={() => expandContext(item.id, item.fileDiff)}
            type="button"
          >
            {busy ? "Expanding…" : "Expand context"}
          </button>
        ) : null}
        <label className="viewed-toggle">
          <input
            checked={rowState?.viewed ?? false}
            onChange={() => toggleViewed(item.id)}
            type="checkbox"
          />
          Viewed
        </label>
      </span>
    );
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
    <div style={{ display: "flex", height: "100vh" }}>
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
            onScroll={handleScroll}
            options={{ diffStyle: split, stickyHeaders: true, theme: themes }}
            ref={codeRef}
            renderHeaderMetadata={renderHeaderMetadata}
            // CodeView must be its own scroll container: its virtualizer reads
            // this element's scrollTop, not an ancestor's. An outer scrolling
            // wrapper breaks both scrolling and virtualization.
            style={{ height: "100vh", overflow: "auto" }}
          />
        </WorkerPoolContextProvider>
      </div>
    </div>
  );
}
