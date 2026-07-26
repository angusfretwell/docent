import { Empty } from "@client/components/empty";
import { Pane } from "@client/components/pane";
import { CodeViewAnnotation } from "@client/features/code-view/annotation";
import type { CodeViewFocus } from "@client/features/code-view/focus";
import { CodeViewHeaderMetadata } from "@client/features/code-view/header-metadata";
import { useDiffItems } from "@client/features/code-view/hooks/use-diff-items";
import { AnnotatedCodeView } from "@client/features/code-view/view";
import { useCommentCompose } from "@client/features/comments/hooks/use-comment-compose";
import { useComments } from "@client/features/comments/hooks/use-comments";
import type { DiffFile } from "@client/lib/diff";
import type { LineDecoration } from "@client/lib/diff-annotations";
import type { DriftResult } from "@client/lib/drift";
import { inlineCommentsAtom } from "@client/lib/preferences";
import type { SelectionSide } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { WalkthroughRange } from "@shared/schemas/walkthrough";
import { useAtomValue } from "jotai/react";
import { GitCompare } from "lucide-react";
import { useEffect, useRef } from "react";

export function CodeWalkthroughDiffPanel({
  activeRange,
  driftFor,
  files,
  reasserted,
}: {
  activeRange: WalkthroughRange | undefined;
  driftFor?: (id: string) => DriftResult | undefined;
  files: DiffFile[];
  reasserted: number;
}) {
  const ref = useRef<CodeViewHandle<LineDecoration>>(null);

  const { visible } = useComments();
  const inlineComments = useAtomValue(inlineCommentsAtom);
  const comments = inlineComments ? visible.map((entry) => entry.comment) : [];

  const compose = useCommentCompose({
    codeRef: ref,
    fileDiffById: (id) => files.find((entry) => entry.id === id)?.file,
  });

  const items = useDiffItems({
    comments,
    composing: compose.composing,
    driftFor,
    files,
  });

  const targetFile =
    activeRange === undefined
      ? undefined
      : files.find((entry) => entry.path === activeRange.file);

  // Depended on as primitives so the effect fires on reaching a new range, not
  // on every render — otherwise it fights the reader for the scroll position.
  const targetId = targetFile?.id;
  const targetLine = activeRange?.lines[0];
  const targetEndLine = activeRange?.lines[1];
  const targetSide: SelectionSide =
    activeRange?.side === "base" ? "deletions" : "additions";

  const focus: CodeViewFocus | null =
    targetId === undefined ||
    targetLine === undefined ||
    targetEndLine === undefined
      ? null
      : {
          itemId: targetId,
          lines: [targetLine, targetEndLine],
          side: targetSide,
        };

  useEffect(() => {
    if (
      targetId === undefined ||
      targetLine === undefined ||
      targetEndLine === undefined
    ) {
      return;
    }

    ref.current?.scrollTo({
      align: "center",
      behavior: "smooth-auto",
      id: targetId,
      lineNumber: targetLine,
      side: targetSide,
      type: "line",
    });
  }, [targetId, targetLine, targetEndLine, targetSide, reasserted]);

  if (items.length === 0) {
    return (
      <Pane>
        <Empty icon={<GitCompare />}>No changes to review.</Empty>
      </Pane>
    );
  }

  return (
    <Pane>
      <AnnotatedCodeView
        disableBackground
        enableGutterUtility={!compose.composing}
        enableLineSelection={!compose.composing}
        expandUnchanged
        focus={focus}
        items={items}
        onGutterUtilityClick={(range, context) =>
          compose.selectLines({ id: context.item.id, range })
        }
        ref={ref}
        renderAnnotation={(annotation) => (
          <CodeViewAnnotation annotation={annotation} compose={compose} />
        )}
        renderHeaderMetadata={(codeViewItem) => (
          <CodeViewHeaderMetadata
            onComment={
              codeViewItem.type === "diff"
                ? () =>
                    compose.commentOnFile(
                      codeViewItem.id,
                      codeViewItem.fileDiff
                    )
                : undefined
            }
          />
        )}
      />
    </Pane>
  );
}
