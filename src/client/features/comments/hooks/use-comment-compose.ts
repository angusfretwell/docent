import type { LineDecoration, Composing } from "@client/lib/diff-annotations";
import { annotationSide } from "@client/lib/diff-annotations";
import type { CodeViewLineSelection, FileDiffMetadata } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { Side } from "@shared/enums/side";
import type { RefObject } from "react";
import { useState } from "react";

import { useCommentWrite } from "./use-comment-write";

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

export interface CommentCompose {
  busy: boolean;
  cancel: () => void;
  commentOnFile: (itemId: string, fileDiff: FileDiffMetadata) => void;
  composing: Composing | null;
  selectLines: (selection: CodeViewLineSelection | null) => void;
  submit: (body: string) => void;
}

export function useCommentCompose(params: {
  codeRef: RefObject<CodeViewHandle<LineDecoration> | null>;
  fileDiffById: (id: string) => FileDiffMetadata | undefined;
}): CommentCompose {
  const { codeRef, fileDiffById } = params;
  const [composing, setComposing] = useState<Composing | null>(null);
  const write = useCommentWrite();

  function cancel() {
    codeRef.current?.clearSelectedLines();
    setComposing(null);
  }

  function submit(body: string) {
    if (composing === null) {
      return;
    }

    write.mutate(
      { anchor: composing.anchor, body, op: "open" },
      { onSuccess: cancel }
    );
  }

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
