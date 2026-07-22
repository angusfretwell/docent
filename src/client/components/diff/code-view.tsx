import { useFindingCompose } from "@client/hooks/use-finding-compose";
import { useFindings } from "@client/hooks/use-findings";
import type { Viewed } from "@client/hooks/use-viewed";
import type { DiffFile } from "@client/lib/diff";
import { diffItemVersion } from "@client/lib/diff";
import type { Annotation } from "@client/lib/diff-annotations";
import { annotationsKey, itemAnnotations } from "@client/lib/diff-annotations";
import { diffTargetAtom } from "@client/lib/diff-target";
import type { DriftResult } from "@client/lib/drift";
import type { CodeViewItem, FileDiffMetadata } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useAtomValue } from "jotai/react";
import { GitCompare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { CodeView } from "../code-view";
import { HeaderMetadata } from "../code-view-header-metadata";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "../ui/empty";
import { DiffAnnotation } from "./annotation";

export function DiffCodeView({
  canAuthor,
  driftFor,
  files,
  viewed,
}: {
  /** Off on the read-only Pending preview: no selection, composer, or comment buttons. */
  canAuthor: boolean;
  /** Per-Finding drift; absent (Pending) falls back to the sync blob-match path. */
  driftFor?: (id: string) => DriftResult | undefined;
  files: DiffFile[];
  viewed: Viewed;
}) {
  const ref = useRef<CodeViewHandle<Annotation>>(null);

  const { visible } = useFindings();
  const findings = visible.map((entry) => entry.finding);

  const compose = useFindingCompose({
    codeRef: ref,
    fileDiffById: (id) => files.find((entry) => entry.id === id)?.file,
  });

  // Explicit collapse choices (chevron clicks, viewed toggles) override the
  // default, which follows viewed state: a viewed file starts collapsed.
  const [collapsedOverrides, setCollapsedOverrides] = useState<
    ReadonlyMap<string, boolean>
  >(new Map());

  function isCollapsed(id: string): boolean {
    return collapsedOverrides.get(id) ?? viewed.isViewed(id);
  }

  const items = files.map<CodeViewItem<Annotation>>((entry) => {
    const collapsed = isCollapsed(entry.id);
    const annotations = itemAnnotations({
      composing: canAuthor ? compose.composing : null,
      driftFor,
      fileDiff: entry.file,
      findings,
      itemId: entry.id,
    });

    return {
      annotations,
      collapsed,
      fileDiff: entry.file,
      id: entry.id,
      type: "diff",
      version: diffItemVersion(entry, collapsed, annotationsKey(annotations)),
    };
  });

  function handleToggleItemCollapsed(itemId: string) {
    const viewer = ref.current?.getInstance();
    const itemTop = viewer?.getTopForItem(itemId);
    const next = !isCollapsed(itemId);

    flushSync(() => {
      setCollapsedOverrides((prev) => new Map(prev).set(itemId, next));
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
    setCollapsedOverrides((prev) => new Map(prev).set(itemId, next));
  }

  // A file-level composer renders as an annotation inside the file, so opening
  // one on a collapsed file would author into something the reader can't see.
  // Expanding is a read, not a re-read: viewed state is deliberately untouched.
  function handleCommentOnFile(itemId: string, fileDiff: FileDiffMetadata) {
    if (isCollapsed(itemId)) {
      setCollapsedOverrides((prev) => new Map(prev).set(itemId, false));
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
    if (isCollapsed(target.id)) {
      flushSync(() => {
        setCollapsedOverrides((prev) => new Map(prev).set(target.id, false));
      });
    }

    ref.current?.scrollTo({ behavior: "smooth", id: target.id, type: "item" });
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed to `target` only; see FINDINGS.md P0-foundation
  }, [target]);

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitCompare />
          </EmptyMedia>
          <EmptyDescription>No changes to review.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <CodeView
      enableLineSelection={!compose.composing}
      enableGutterUtility={!compose.composing}
      items={items}
      onToggleItemCollapsed={handleToggleItemCollapsed}
      ref={ref}
      onGutterUtilityClick={(range, context) =>
        compose.selectLines({ id: context.item.id, range })
      }
      renderAnnotation={(annotation) => (
        <DiffAnnotation annotation={annotation} compose={compose} />
      )}
      renderHeaderMetadata={(codeViewItem) => (
        <HeaderMetadata
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
