import type { CodeViewItem } from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { CodeView, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileTree } from "./file-tree.tsx";
import {
  buildTree,
  changeAnchors,
  type FileOrder,
  filterEntries,
  flattenFiles,
  parseFiles,
  sortEntries,
  stepChange,
  stepFile,
} from "./nav.ts";

const themes = { dark: "github-dark", light: "github-light" } as const;

// One Shiki-tokenizing worker per hardware thread (capped). Tokenization must
// stay off the main thread: the #4 re-benchmark measured worker-off scroll at
// p95 225 ms with 15 long frames vs. zero with the pool on.
function workerFactory() {
  return new Worker(
    new URL("@pierre/diffs/worker/worker.js", import.meta.url),
    {
      type: "module",
    },
  );
}

/** A localStorage-backed preference, so layout/order survive reloads. */
function usePersisted<T extends string>(
  key: string,
  initial: T,
  decode: (raw: string) => T | undefined,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = globalThis.localStorage?.getItem(key);
    return (raw !== null && raw !== undefined && decode(raw)) || initial;
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      globalThis.localStorage?.setItem(key, next);
    },
    [key],
  );
  return [value, set];
}

/**
 * The Diff tab: the compact-folder navigation tree beside the whole branch
 * diff rendered as one continuous virtualized cross-file scroll. The tree and
 * the scroll share a single ordered file model, so position stays in sync.
 */
export function DiffView({ patch }: { patch: string }) {
  const [filter, setFilter] = useState("");
  const [order, setOrder] = usePersisted<FileOrder>(
    "docent:fileOrder",
    "path",
    (raw) => (raw === "size" || raw === "path" ? raw : undefined),
  );
  const [split, setSplit] = usePersisted<"unified" | "split">(
    "docent:diffStyle",
    "unified",
    (raw) => (raw === "split" || raw === "unified" ? raw : undefined),
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [activeId, setActiveId] = useState<string | undefined>();

  const codeRef = useRef<CodeViewHandle<undefined>>(null);

  // The single ordered file model both surfaces read from. Filtering rebuilds
  // the tree; flattening it is the scroll order, so the two always agree.
  const { entries, tree, anchors } = useMemo(() => {
    const all = sortEntries(parseFiles(patch), order);
    const visible = filterEntries(all, filter);
    const builtTree = buildTree(visible);
    const flat = flattenFiles(builtTree);
    return {
      anchors: changeAnchors(flat),
      entries: flat,
      tree: builtTree,
    };
  }, [patch, order, filter]);

  const items = useMemo<CodeViewItem[]>(() => {
    const byName = new Map(
      processPatch(patch).files.map((f, i) => [`${f.name}#${i}`, f]),
    );
    return entries.flatMap((entry) => {
      const fileDiff = byName.get(entry.id);
      return fileDiff
        ? [{ fileDiff, id: entry.id, type: "diff" as const }]
        : [];
    });
  }, [patch, entries]);

  const scrollToId = useCallback((id: string) => {
    codeRef.current?.scrollTo({ behavior: "smooth", id, type: "item" });
    setActiveId(id);
  }, []);

  // Two-way sync: the scroll drives the active file. The active file is the
  // last item whose top has passed the viewport top.
  const handleScroll = useCallback(
    (
      scrollTop: number,
      viewer: NonNullable<ReturnType<CodeViewHandle<undefined>["getInstance"]>>,
    ) => {
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
    },
    [items],
  );

  const jump = useCallback(
    (kind: "file" | "change", direction: 1 | -1) => {
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
    },
    [entries, anchors, activeId, scrollToId],
  );

  const toggleDir = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Keyboard jumps — [ ] step files, , . step changes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const map: Record<string, ["file" | "change", 1 | -1]> = {
        "[": ["file", -1],
        "]": ["file", 1],
        ",": ["change", -1],
        ".": ["change", 1],
      };
      const action = map[event.key];
      if (action) {
        event.preventDefault();
        jump(action[0], action[1]);
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [jump]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
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
