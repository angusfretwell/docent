import type { Annotation } from "@client/lib/diff-annotations";
import { diffLayoutAtom } from "@client/lib/preferences";
import { workerFactory, themes } from "@client/lib/worker-factory";
import type {
  CodeViewDiffItem,
  CodeViewFileItem,
  CodeViewItem,
  CodeViewOptions,
  DiffLineAnnotation,
  LineAnnotation,
  SelectedLineRange,
} from "@pierre/diffs";
import {
  CodeView as BaseCodeView,
  WorkerPoolContextProvider,
} from "@pierre/diffs/react";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useAtomValue } from "jotai/react";
import type { ReactNode, RefObject } from "react";
import { useMemo } from "react";

import { HeaderPrefix } from "./code-view-header-prefix";

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

interface CodeViewProps {
  items: CodeViewItem<Annotation>[];
  onGutterUtilityClick?: (
    range: SelectedLineRange,
    context: {
      item: CodeViewFileItem<Annotation> | CodeViewDiffItem<Annotation>;
    }
  ) => void;
  enableGutterUtility?: boolean;
  enableLineSelection?: boolean;
  /** Omit to render the file headers without a collapse control. */
  onToggleItemCollapsed?: (itemId: string) => void;
  ref: RefObject<CodeViewHandle<Annotation> | null>;
  renderAnnotation?: (
    annotation: LineAnnotation<Annotation> | DiffLineAnnotation<Annotation>
  ) => ReactNode;
  renderHeaderMetadata?: (item: CodeViewItem<Annotation>) => ReactNode;
}

export function CodeView({
  items,
  onGutterUtilityClick,
  enableLineSelection,
  enableGutterUtility,
  onToggleItemCollapsed,
  ref,
  renderAnnotation,
  renderHeaderMetadata,
}: CodeViewProps) {
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
    <WorkerPoolContextProvider
      poolOptions={{ workerFactory }}
      highlighterOptions={{
        langs: ["typescript", "javascript", "css", "html"],
        preferredHighlighter: "shiki-wasm",
        theme: themes,
      }}
    >
      <BaseCodeView
        ref={ref}
        items={items}
        className="overscroll-contain overflow-auto diffs "
        options={options}
        renderAnnotation={renderAnnotation}
        renderHeaderMetadata={renderHeaderMetadata}
        renderHeaderPrefix={
          onToggleItemCollapsed === undefined
            ? undefined
            : (item) => (
                <HeaderPrefix
                  item={item}
                  onToggleItemCollapsed={onToggleItemCollapsed}
                />
              )
        }
      />
    </WorkerPoolContextProvider>
  );
}
