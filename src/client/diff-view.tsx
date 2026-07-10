import type { CodeViewItem, FileDiffMetadata } from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { CodeView, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
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
import type { FileOrder } from "./nav.ts";

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
 * The Diff tab: the compact-folder navigation tree beside the whole branch
 * diff rendered as one continuous virtualized cross-file scroll. The tree and
 * the scroll share a single ordered file model, so position stays in sync.
 *
 * Context expansion is pluggable so the same surface renders both a committed
 * Change (both sides from `/api/blob/:sha`) and the Pending working-tree preview
 * (head side from `/api/worktree`). Defaults are the committed-Change fetchers.
 */
export function DiffView({
  patch,
  ref,
  expandFile = fetchExpandedFileDiff,
  isFileExpandable = isExpandable,
}: {
  patch: string;
  ref?: React.Ref<DiffViewHandle>;
  expandFile?: (fileDiff: FileDiffMetadata) => Promise<FileDiffMetadata>;
  isFileExpandable?: (fileDiff: FileDiffMetadata) => boolean;
}) {
  const [filter, setFilter] = useState("");
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
  // Files whose full base/head blobs have been lazily fetched, keyed by item
  // id. A present entry is a non-partial diff that the renderer can expand;
  // `expanding` holds ids with a fetch in flight so the affordance can't
  // double-fire.
  const [expanded, setExpanded] = useState<ReadonlyMap<string, FileDiffMetadata>>(new Map());
  const [expanding, setExpanding] = useState<ReadonlySet<string>>(new Set());

  const codeRef = useRef<CodeViewHandle<undefined>>(null);

  // The single ordered file model both surfaces read from. Filtering rebuilds
  // the tree; flattening it is the scroll order, so the two always agree.
  // React Compiler memoizes these derivations, so no manual useMemo is needed.
  const sorted = sortEntries(parseFiles(patch), order);
  const visible = filterEntries(sorted, filter);
  const tree = buildTree(visible);
  const entries = flattenFiles(tree);
  const anchors = changeAnchors(entries);

  const byName = new Map(processPatch(patch).files.map((f, i) => [`${f.name}#${i}`, f]));
  // The lazily-fetched full diff wins over the patch-only one, so an expanded
  // file renders with context available.
  const items: CodeViewItem[] = entries.flatMap((entry) => {
    const fileDiff = expanded.get(entry.id) ?? byName.get(entry.id);
    return fileDiff ? [{ fileDiff, id: entry.id, type: "diff" as const }] : [];
  });

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

  function renderExpandContext(item: CodeViewItem) {
    if (item.type !== "diff" || !isFileExpandable(item.fileDiff)) {
      return null;
    }
    const busy = expanding.has(item.id);
    return (
      <button
        className="expand-context"
        disabled={busy}
        onClick={() => expandContext(item.id, item.fileDiff)}
        type="button"
      >
        {busy ? "Expanding…" : "Expand context"}
      </button>
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
    <div style={{ display: "flex", height: "100%" }}>
      <FileTree
        activeId={activeId}
        collapsed={collapsed}
        filter={filter}
        nodes={tree}
        onFilterChange={setFilter}
        onJump={jump}
        onOrderChange={setOrder}
        onSelect={scrollToId}
        onSplitChange={(next) => setSplit(next ? "split" : "unified")}
        onToggleDir={toggleDir}
        order={order}
        split={split === "split"}
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
            renderHeaderMetadata={renderExpandContext}
            // CodeView must be its own scroll container: its virtualizer reads
            // this element's scrollTop, not an ancestor's. An outer scrolling
            // wrapper breaks both scrolling and virtualization.
            style={{ height: "100%", overflow: "auto" }}
          />
        </WorkerPoolContextProvider>
      </div>
    </div>
  );
}
