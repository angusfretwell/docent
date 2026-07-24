import { Empty } from "@client/components/empty";
import { Pane } from "@client/components/pane";
import { CodeViewAnnotation } from "@client/features/code-view/annotation";
import { CodeViewHeaderMetadata } from "@client/features/code-view/header-metadata";
import {
  AnnotatedCodeView,
  useDiffItems,
} from "@client/features/code-view/view";
import { useFindingCompose } from "@client/features/findings/hooks/use-finding-compose";
import { useFindings } from "@client/features/findings/hooks/use-findings";
import type { DiffFile } from "@client/lib/diff";
import type { Annotation } from "@client/lib/diff-annotations";
import type { DriftResult } from "@client/lib/drift";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { WalkthroughRange } from "@shared/schemas/walkthrough";
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
  const ref = useRef<CodeViewHandle<Annotation>>(null);

  const { visible } = useFindings();
  const findings = visible.map((entry) => entry.finding);

  const compose = useFindingCompose({
    codeRef: ref,
    fileDiffById: (id) => files.find((entry) => entry.id === id)?.file,
  });

  const items = useDiffItems({
    composing: compose.composing,
    driftFor,
    files,
    findings,
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
  const targetSide = activeRange?.side === "base" ? "deletions" : "additions";

  useEffect(() => {
    if (
      targetId === undefined ||
      targetLine === undefined ||
      targetEndLine === undefined
    ) {
      ref.current?.clearSelectedLines();

      return;
    }

    ref.current?.setSelectedLines({
      id: targetId,
      range: {
        end: targetEndLine,
        endSide: targetSide,
        side: targetSide,
        start: targetLine,
      },
    });

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
        enableGutterUtility={!compose.composing}
        enableLineSelection={!compose.composing}
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
