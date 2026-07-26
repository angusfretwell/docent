import { Empty } from "@client/components/empty";
import { CodeViewAnnotation } from "@client/features/code-view/annotation";
import { CodeViewHeaderMetadata } from "@client/features/code-view/header-metadata";
import { useDiffItems } from "@client/features/code-view/hooks/use-diff-items";
import { AnnotatedCodeView } from "@client/features/code-view/view";
import { useCommentCompose } from "@client/features/comments/hooks/use-comment-compose";
import { useComments } from "@client/features/comments/hooks/use-comments";
import type { Collapsed } from "@client/features/diff/hooks/use-collapsed";
import type { Viewed } from "@client/features/diff/hooks/use-viewed";
import type { DiffFile } from "@client/lib/diff";
import type { LineDecoration } from "@client/lib/diff-annotations";
import { diffTargetAtom } from "@client/lib/diff-target";
import type { DriftResult } from "@client/lib/drift";
import { inlineCommentsAtom } from "@client/lib/preferences";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useAtomValue } from "jotai/react";
import { GitCompare } from "lucide-react";
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";

export function DiffCodeView({
  canAuthor,
  collapsed,
  driftFor,
  files,
  viewed,
}: {
  /** Off on the read-only Pending preview: no selection, composer, or comment buttons. */
  canAuthor: boolean;
  collapsed: Collapsed;
  /** Absent on Pending, which falls back to the sync blob-match path. */
  driftFor?: (id: string) => DriftResult | undefined;
  files: DiffFile[];
  viewed: Viewed;
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
    composing: canAuthor ? compose.composing : null,
    driftFor,
    files,
    isCollapsed: collapsed.isCollapsed,
  });

  function handleToggleItemCollapsed(itemId: string) {
    const viewer = ref.current?.getInstance();
    const itemTop = viewer?.getTopForItem(itemId);
    const next = !collapsed.isCollapsed(itemId);

    flushSync(() => {
      collapsed.setCollapsed(itemId, next);
    });

    // Collapsing an item that starts above the viewport would yank the
    // content; pin the collapsed header to the top instead.
    if (viewer && itemTop && itemTop < viewer.getScrollTop()) {
      viewer.scrollTo({ align: "start", id: itemId, type: "item" });
    }
  }

  function handleToggleViewed(itemId: string) {
    const next = !viewed.isViewed(itemId);

    viewed.toggleViewed(itemId);
    collapsed.setCollapsed(itemId, next);
  }

  // A file-level composer renders inside the file, so opening one on a collapsed
  // file would author into something unseen. Expanding is a read, not a re-read
  // — viewed state is deliberately untouched.
  function handleCommentOnFile(itemId: string, fileDiff: FileDiffMetadata) {
    if (collapsed.isCollapsed(itemId)) {
      collapsed.setCollapsed(itemId, false);
    }

    compose.commentOnFile(itemId, fileDiff);
  }

  const target = useAtomValue(diffTargetAtom);

  useEffect(() => {
    if (!target) {
      return;
    }

    // Revealing a collapsed file would scroll to a header with nothing under
    // it; expand first so the destination is the diff, not the stub.
    if (collapsed.isCollapsed(target.id)) {
      flushSync(() => {
        collapsed.setCollapsed(target.id, false);
      });
    }

    ref.current?.scrollTo({ behavior: "smooth", id: target.id, type: "item" });
    // Keyed to `target` only: listing `collapsed` would re-run this reveal on
    // every collapse toggle, not only on a jump to a new target.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (items.length === 0) {
    return <Empty icon={<GitCompare />}>No changes to review.</Empty>;
  }

  return (
    <AnnotatedCodeView
      enableLineSelection={!compose.composing}
      enableGutterUtility={!compose.composing}
      items={items}
      onToggleItemCollapsed={handleToggleItemCollapsed}
      ref={ref}
      onGutterUtilityClick={(range, context) =>
        compose.selectLines({ id: context.item.id, range })
      }
      renderAnnotation={(annotation) => (
        <CodeViewAnnotation annotation={annotation} compose={compose} />
      )}
      renderHeaderMetadata={(codeViewItem) => (
        <CodeViewHeaderMetadata
          onComment={
            canAuthor && codeViewItem.type === "diff"
              ? () =>
                  handleCommentOnFile(codeViewItem.id, codeViewItem.fileDiff)
              : undefined
          }
          onToggleViewed={() => handleToggleViewed(codeViewItem.id)}
          viewed={viewed.isViewed(codeViewItem.id)}
        />
      )}
    />
  );
}
