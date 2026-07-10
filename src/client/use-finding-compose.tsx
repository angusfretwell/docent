/**
 * The authoring state behind the diff's inline composer: opening a line- or
 * file-anchored Finding, and submitting it as a root (open) record. Kept out of
 * `diff-view.tsx` so the diff component stays about rendering; this owns only
 * the compose lifecycle (data-model.md §5.3).
 */

import type { FileDiffMetadata } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useState } from "react";
import type { FindingWrite } from "../shared/finding-write.ts";
import type { Annotation, Composing } from "./diff-annotations.ts";
import { annotationSide } from "./diff-annotations.ts";

export interface FindingCompose {
  composing: Composing | null;
  busy: boolean;
  cancel: () => void;
  submit: (body: string) => void;
  selectLines: (
    selection: { id: string; range: { start: number; end: number; side?: string } } | null,
  ) => void;
  commentOnFile: (itemId: string, fileDiff: FileDiffMetadata) => void;
}

export function useFindingCompose(params: {
  codeRef: React.RefObject<CodeViewHandle<Annotation> | null>;
  fileDiffById: (id: string) => FileDiffMetadata | undefined;
  onWrite: (write: FindingWrite) => Promise<void>;
}): FindingCompose {
  const { codeRef, fileDiffById, onWrite } = params;
  const [composing, setComposing] = useState<Composing | null>(null);
  const [busy, setBusy] = useState(false);

  function cancel() {
    codeRef.current?.clearSelectedLines();
    setComposing(null);
  }

  // Submit the in-progress composer as a new root (open) record. The SSE refresh
  // re-folds the snapshot, so the fresh Finding re-renders as a thread.
  function submit(body: string) {
    if (composing === null) {
      return;
    }
    const { anchor } = composing;
    setBusy(true);
    void onWrite({ anchor, body, op: "open" })
      .then(cancel)
      .finally(() => setBusy(false));
  }

  // A line selection opens a line-anchored composer. The anchor freezes the
  // exact blob bytes on the selected side (content-addressed born anchor); a
  // side with no blob (e.g. an add's base side) can't be anchored, so it opens
  // nothing.
  function selectLines(
    selection: { id: string; range: { start: number; end: number; side?: string } } | null,
  ) {
    if (selection === null) {
      setComposing(null);
      return;
    }
    const fileDiff = fileDiffById(selection.id);
    if (fileDiff === undefined) {
      return;
    }
    const side = selection.range.side === "deletions" ? "base" : "head";
    const blobSha = side === "head" ? fileDiff.newObjectId : fileDiff.prevObjectId;
    if (blobSha === undefined) {
      return;
    }
    const file = side === "head" ? fileDiff.name : (fileDiff.prevName ?? fileDiff.name);
    setComposing({
      anchor: {
        blobSha,
        file,
        kind: "line",
        lines: [selection.range.start, selection.range.end],
        side,
      },
      annotationSide: annotationSide(side),
      itemId: selection.id,
      lineNumber: selection.range.end,
    });
  }

  // A file-level Finding: anchor the whole file version (prefer the head blob,
  // fall back to base for a deletion). Its composer renders at line 0.
  function commentOnFile(itemId: string, fileDiff: FileDiffMetadata) {
    const side = fileDiff.newObjectId === undefined ? "base" : "head";
    const blobSha = side === "head" ? fileDiff.newObjectId : fileDiff.prevObjectId;
    if (blobSha === undefined) {
      return;
    }
    const file = side === "head" ? fileDiff.name : (fileDiff.prevName ?? fileDiff.name);
    codeRef.current?.clearSelectedLines();
    setComposing({
      anchor: { blobSha, file, kind: "file", side },
      annotationSide: annotationSide(side),
      itemId,
      lineNumber: 0,
    });
  }

  return { busy, cancel, commentOnFile, composing, selectLines, submit };
}
