/**
 * The authoring state behind the diff's inline composer: opening a line- or
 * file-anchored Finding, and submitting it as a root (open) record through the
 * shared write path. This owns only the compose lifecycle (data-model.md §5.3);
 * the anchor placement model lives in `lib/diff-annotations.ts`.
 */

import type { Annotation, Composing } from "@client/lib/diff-annotations";
import { annotationSide } from "@client/lib/diff-annotations";
import type { CodeViewLineSelection, FileDiffMetadata } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { Side } from "@shared/enums/side";
import type { RefObject } from "react";
import { useState } from "react";

import { useFindingWrite } from "./use-finding-write";

// The content-addressed anchor target on one side of a file: the born blob and
// the path to freeze into the anchor. A side with no blob (e.g. an add's base
// side) can't be anchored, so it yields nothing.
function anchorTarget(fileDiff: FileDiffMetadata, side: Side) {
  const blobSha =
    side === "head" ? fileDiff.newObjectId : fileDiff.prevObjectId;
  if (blobSha === undefined) {
    return;
  }

  const file =
    side === "head" ? fileDiff.name : (fileDiff.prevName ?? fileDiff.name);
  return { blobSha, file };
}

export interface FindingCompose {
  busy: boolean;
  cancel: () => void;
  commentOnFile: (itemId: string, fileDiff: FileDiffMetadata) => void;
  composing: Composing | null;
  selectLines: (selection: CodeViewLineSelection | null) => void;
  submit: (body: string) => void;
}

export function useFindingCompose(params: {
  codeRef: RefObject<CodeViewHandle<Annotation> | null>;
  fileDiffById: (id: string) => FileDiffMetadata | undefined;
}): FindingCompose {
  const { codeRef, fileDiffById } = params;
  const [composing, setComposing] = useState<Composing | null>(null);
  const write = useFindingWrite();

  function cancel() {
    codeRef.current?.clearSelectedLines();
    setComposing(null);
  }

  // Submit the in-progress composer as a new root (open) record. The SSE refresh
  // re-folds the snapshot, so the fresh Finding re-renders as a thread. A failed
  // write leaves the composer open with its draft intact.
  function submit(body: string) {
    if (composing === null) {
      return;
    }

    write.mutate(
      { anchor: composing.anchor, body, op: "open" },
      { onSuccess: cancel }
    );
  }

  // A line selection opens a line-anchored composer. The anchor freezes the
  // exact blob bytes on the selected side (content-addressed born anchor); a
  // side with no blob (e.g. an add's base side) can't be anchored, so it opens
  // nothing.
  function selectLines(selection: CodeViewLineSelection | null) {
    if (selection === null) {
      setComposing(null);
      return;
    }

    const fileDiff = fileDiffById(selection.id);
    if (fileDiff === undefined) {
      return;
    }

    const side = selection.range.side === "deletions" ? "base" : "head";
    const target = anchorTarget(fileDiff, side);
    if (target === undefined) {
      return;
    }

    setComposing({
      anchor: {
        blobSha: target.blobSha,
        file: target.file,
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
    const target = anchorTarget(fileDiff, side);
    if (target === undefined) {
      return;
    }

    codeRef.current?.clearSelectedLines();
    setComposing({
      anchor: {
        blobSha: target.blobSha,
        file: target.file,
        kind: "file",
        side,
      },
      annotationSide: annotationSide(side),
      itemId,
      lineNumber: 0,
    });
  }

  return {
    busy: write.isPending,
    cancel,
    commentOnFile,
    composing,
    selectLines,
    submit,
  };
}
