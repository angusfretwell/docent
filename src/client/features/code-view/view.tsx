import type { DiffFile } from "@client/lib/diff";
import { diffItemVersion } from "@client/lib/diff";
import type { Annotation, Composing } from "@client/lib/diff-annotations";
import { annotationsKey, itemAnnotations } from "@client/lib/diff-annotations";
import type { DriftResult } from "@client/lib/drift";
import { diffLayoutAtom } from "@client/lib/preferences";
import type {
  CodeViewDiffItem,
  CodeViewFileItem,
  CodeViewItem,
  CodeViewOptions,
  DiffLineAnnotation,
  LineAnnotation,
  SelectedLineRange,
} from "@pierre/diffs";
import { CodeView as BaseCodeView } from "@pierre/diffs/react";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { FoldedFinding } from "@shared/lib/finding";
import { useAtomValue } from "jotai/react";
import type { ReactNode, RefObject } from "react";
import { useMemo } from "react";

import { CodeViewHeaderPrefix } from "./header-prefix";

// @pierre diffs theming is split between this block and the global stylesheet
// `@client/styles/diffs.css`; change one, check the other.
const DIFFS_CSS = `
  [data-diffs-header] {
    padding-inline: calc(var(--spacing) * 3);
    container-type: scroll-state;
    container-name: sticky-header;
  }

  [data-diffs-header]::before {
    position: absolute;
    top: -1px;
    left: 0;
    width: 100%;
    height: 1px;
    content: '';
    background-color: var(--color-border);
  }

   @container sticky-header scroll-state(stuck: top) {
    [data-diffs-header]::after {
      position: absolute;
      bottom: -1px;
      left: 0;
      width: 100%;
      height: 1px;
      content: '';
      background-color: var(--color-border);
    }
  }
`;

export function useDiffItems({
  composing,
  driftFor,
  files,
  findings,
  isCollapsed = () => false,
}: {
  composing: Composing | null;
  driftFor?: (id: string) => DriftResult | undefined;
  files: DiffFile[];
  findings: readonly FoldedFinding[];
  isCollapsed?: (itemId: string) => boolean;
}): CodeViewItem<Annotation>[] {
  return files.map((entry) => {
    const collapsed = isCollapsed(entry.id);
    const annotations = itemAnnotations({
      composing,
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
}

interface AnnotatedCodeViewProps {
  items: CodeViewItem<Annotation>[];
  onGutterUtilityClick?: (
    range: SelectedLineRange,
    context: {
      item: CodeViewFileItem<Annotation> | CodeViewDiffItem<Annotation>;
    }
  ) => void;
  enableGutterUtility?: boolean;
  enableLineSelection?: boolean;
  onToggleItemCollapsed?: (itemId: string) => void;
  ref: RefObject<CodeViewHandle<Annotation> | null>;
  renderAnnotation?: (
    annotation: LineAnnotation<Annotation> | DiffLineAnnotation<Annotation>
  ) => ReactNode;
  renderHeaderMetadata?: (item: CodeViewItem<Annotation>) => ReactNode;
}

export function AnnotatedCodeView({
  items,
  onGutterUtilityClick,
  enableLineSelection,
  enableGutterUtility,
  onToggleItemCollapsed,
  ref,
  renderAnnotation,
  renderHeaderMetadata,
}: AnnotatedCodeViewProps) {
  const diffLayout = useAtomValue(diffLayoutAtom);

  const options = useMemo<CodeViewOptions<Annotation>>(
    () => ({
      diffStyle: diffLayout,
      disableVirtualizationBuffers: true,
      enableGutterUtility,
      enableLineSelection,
      layout: { gap: 0, paddingBottom: 0, paddingTop: 0 },
      onGutterUtilityClick,
      overflow: "wrap",
      stickyHeaders: true,
      unsafeCSS: DIFFS_CSS,
    }),
    [diffLayout, enableGutterUtility, enableLineSelection, onGutterUtilityClick]
  );

  return (
    <BaseCodeView
      ref={ref}
      items={items}
      className="diffs overflow-auto overscroll-contain"
      options={options}
      renderAnnotation={renderAnnotation}
      renderHeaderMetadata={renderHeaderMetadata}
      renderHeaderPrefix={
        onToggleItemCollapsed === undefined
          ? undefined
          : (item) => (
              <CodeViewHeaderPrefix
                item={item}
                onToggleItemCollapsed={onToggleItemCollapsed}
              />
            )
      }
    />
  );
}
