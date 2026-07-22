import { useFindingCompose } from "@client/hooks/use-finding-compose";
import { useFindings } from "@client/hooks/use-findings";
import type { DiffFile } from "@client/lib/diff";
import { diffItemVersion } from "@client/lib/diff";
import type { Annotation } from "@client/lib/diff-annotations";
import { annotationsKey, itemAnnotations } from "@client/lib/diff-annotations";
import type { DriftResult } from "@client/lib/drift";
import type { CodeViewItem } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { WalkthroughRange } from "@shared/schemas/walkthrough";
import { GitCompare } from "lucide-react";
import { useEffect, useRef } from "react";

import { CodeView } from "../code-view";
import { HeaderMetadata } from "../code-view-header-metadata";
import { DiffAnnotation } from "../diff/annotation";
import { IconEmpty } from "../icon-empty";
import { Pane } from "../pane";

/**
 * The Code walkthrough's target panel: the branch diff narrowed to the files the
 * tour actually visits, scrolled to whichever range the reader has reached.
 *
 * The whole tour's files stay mounted rather than swapping to the active
 * section's alone, so the surrounding change stays readable and scrolling
 * between adjacent ranges in one file is continuous instead of a remount. Only
 * files are filtered, not hunks: a `Hunk` indexes into its file's shared
 * `additionLines`/`deletionLines` arrays, so a filtered hunk list would address
 * the wrong lines. Line-precise `scrollTo` gets the reader to the exact range
 * without touching the parsed structure.
 *
 * The files carry no collapse control. The prose drives this panel, so a
 * collapsed file is a range the tour can no longer scroll to — a way to break
 * the read with no counterpart benefit on a set already narrowed to the tour.
 *
 * The reached range is selected as well as scrolled to, so the panel says which
 * lines the prose means rather than leaving the reader to infer it from the
 * scroll position. Selection highlights the lines in place, so unlike an
 * annotation it costs no layout and can't collide with the finding annotations.
 *
 * Findings are authored and read here on the same terms as the Diff tab — one
 * Review-wide set, not a per-pillar one, so a line commented on during the tour
 * is the same thread the Diff tab shows. The tour goes on driving the panel
 * while a composer is open: the prose only re-aims when the reader moves it, and
 * the in-progress anchor is already captured in compose state, so a re-aim costs
 * the composer its scroll position but never its draft.
 *
 * Bumping `reasserted` scrolls to the active range again without it having
 * changed — how a chip click reaches a panel the reader has since scrolled away.
 */
export function WalkthroughDiffPanel({
  activeRange,
  driftFor,
  files,
  reasserted,
}: {
  activeRange: WalkthroughRange | undefined;
  /** Per-Finding drift, so a shifted anchor pins to its moved line. */
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

  const items = files.map<CodeViewItem<Annotation>>((entry) => {
    const annotations = itemAnnotations({
      composing: compose.composing,
      driftFor,
      fileDiff: entry.file,
      findings,
      itemId: entry.id,
    });

    return {
      annotations,
      collapsed: false,
      fileDiff: entry.file,
      id: entry.id,
      type: "diff",
      version: diffItemVersion(entry, false, annotationsKey(annotations)),
    };
  });

  const targetFile =
    activeRange === undefined
      ? undefined
      : files.find((entry) => entry.path === activeRange.file);

  // Depended on as primitives so the scroll fires when the reader reaches a new
  // range rather than on every re-render — otherwise it would fight them for
  // control of the scroll position.
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
        <IconEmpty icon={<GitCompare />}>No changes to review.</IconEmpty>
      </Pane>
    );
  }

  return (
    <Pane>
      <CodeView
        // enableGutterUtility={!compose.composing}
        enableLineSelection={!compose.composing}
        items={items}
        onGutterUtilityClick={(range, context) =>
          compose.selectLines({ id: context.item.id, range })
        }
        ref={ref}
        renderAnnotation={(annotation) => (
          <DiffAnnotation annotation={annotation} compose={compose} />
        )}
        renderHeaderMetadata={(codeViewItem) => (
          <HeaderMetadata
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
