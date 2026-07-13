/**
 * The Diff tab's cross-file navigation: the active file (two-way synced with
 * scroll position), the `[ ] , .` keyboard jumps, and the imperative
 * scroll-to-file/scroll-to-line surface the Findings panel and the walkthrough
 * tab drive. Factored out of `diff-view.tsx` so the position/jump logic is
 * legible on its own; the ordered file/anchor model it walks comes from
 * `lib/file-model.ts`.
 */

import type { ChangeAnchor, FileEntry } from "@client/lib/nav";
import { stepChange, stepFile } from "@client/lib/nav";
import type { CodeViewItem } from "@pierre/diffs";
import { processPatch } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";

import type { Annotation } from "./diff-annotations";
import type { DiffViewHandle } from "./diff-view";

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
function useJumpKeys(
  jump: (kind: "file" | "change", direction: 1 | -1) => void
) {
  const jumpRef = useRef(jump);
  useEffect(() => {
    jumpRef.current = jump;
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const { target } = event;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
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

export interface DiffNav {
  activeId: string | undefined;
  scrollToId: (id: string) => void;
  handleScroll: (
    scrollTop: number,
    viewer: NonNullable<ReturnType<CodeViewHandle<Annotation>["getInstance"]>>
  ) => void;
  jump: (kind: "file" | "change", direction: 1 | -1) => void;
}

/**
 * @param codeRef The mounted renderer's imperative handle, shared with the Finding layer.
 * @param patch The Change's raw patch, to resolve a Finding anchor's file to its item id.
 * @param entries The visible, ordered file entries `jump("file", …)` steps through.
 * @param anchors The visible hunk-level change anchors `jump("change", …)` steps through.
 * @param items The rendered item list `handleScroll` walks to find the active file.
 * @param ref DiffView's own imperative handle, wired to `scrollToLine`.
 */
export function useDiffNav(params: {
  codeRef: React.RefObject<CodeViewHandle<Annotation> | null>;
  patch: string;
  entries: readonly FileEntry[];
  anchors: readonly ChangeAnchor[];
  items: readonly CodeViewItem<Annotation>[];
  ref: React.Ref<DiffViewHandle> | undefined;
}): DiffNav {
  const { codeRef, patch, entries, anchors, items, ref } = params;
  const [activeId, setActiveId] = useState<string | undefined>();

  function scrollToId(id: string) {
    codeRef.current?.scrollTo({ behavior: "smooth", id, type: "item" });
    setActiveId(id);
  }

  // Jump the scroll to a Finding's anchored file/line. The item id encodes the
  // file's index in the patch (`name#index`), so a Finding anchor — which knows
  // only the path — is resolved against the parsed patch here, where that index
  // lives. A file the diff no longer contains (an outdated Finding) is a no-op.
  function scrollToLine(
    file: string,
    line: number,
    side: "base" | "head" = "head"
  ) {
    const index = processPatch(patch).files.findIndex(
      (fileDiff) => fileDiff.name === file
    );
    if (index === -1) {
      return;
    }
    const id = `${file}#${index}`;
    // git side → renderer column: base ⇒ deletions, head ⇒ additions.
    codeRef.current?.scrollTo({
      behavior: "smooth",
      id,
      lineNumber: line,
      side: side === "base" ? "deletions" : "additions",
      type: "line",
    });
    setActiveId(id);
  }
  useImperativeHandle(ref, () => ({ scrollToLine }));

  // Two-way sync: the scroll drives the active file. The active file is the
  // last item whose top has passed the viewport top.
  function handleScroll(
    scrollTop: number,
    viewer: NonNullable<ReturnType<CodeViewHandle<Annotation>["getInstance"]>>
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
        entries.map((entry) => entry.id),
        activeId,
        direction
      );
      if (next !== undefined) {
        scrollToId(next);
      }
      return;
    }
    const currentIndex = Math.max(
      anchors.findIndex((anchor) => anchor.fileId === activeId),
      0
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

  useJumpKeys(jump);

  return { activeId, handleScroll, jump, scrollToId };
}
