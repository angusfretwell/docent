import { Empty } from "@client/components/empty";
import { Pane } from "@client/components/pane";
import { CodeViewAnnotation } from "@client/features/code-view/annotation";
import { CodeViewHeaderMetadata } from "@client/features/code-view/header-metadata";
import { useDiffItems } from "@client/features/code-view/hooks/use-diff-items";
import { AnnotatedCodeView } from "@client/features/code-view/view";
import { useCommentCompose } from "@client/features/comments/hooks/use-comment-compose";
import { useComments } from "@client/features/comments/hooks/use-comments";
import type { DiffFile } from "@client/lib/diff";
import type { LineDecoration } from "@client/lib/diff-annotations";
import type { DriftResult } from "@client/lib/drift";
import { inlineCommentsAtom } from "@client/lib/preferences";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { WalkthroughRange } from "@shared/schemas/walkthrough";
import { useAtomValue } from "jotai/react";
import { GitCompare } from "lucide-react";
import { useRef } from "react";

import { useDiffAim } from "./hooks/use-diff-aim";

export function CodeWalkthroughDiffPanel({
  activeKey,
  driftFor,
  files,
  onReach,
  ranges,
  reasserted,
}: {
  activeKey: string | undefined;
  driftFor?: (id: string) => DriftResult | undefined;
  files: DiffFile[];
  /** Called with the target the reader has scrolled the diff to. */
  onReach: (key: string) => void;
  ranges: ReadonlyMap<string, WalkthroughRange>;
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

  const { focus, onScroll: handleScroll } = useDiffAim({
    activeKey,
    files,
    onReach,
    ranges,
    reasserted,
    viewRef: ref,
  });

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
        focus={focus}
        items={items}
        onGutterUtilityClick={(range, context) =>
          compose.selectLines({ id: context.item.id, range })
        }
        onScroll={handleScroll}
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
