import type { LineDecoration } from "@client/lib/diff-annotations";
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
import { useAtomValue } from "jotai/react";
import type { ReactNode, RefObject } from "react";
import { useMemo } from "react";

import { CodeViewHeaderPrefix } from "./header-prefix";

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

interface AnnotatedCodeViewProps {
  items: CodeViewItem<LineDecoration>[];
  onGutterUtilityClick?: (
    range: SelectedLineRange,
    context: {
      item: CodeViewFileItem<LineDecoration> | CodeViewDiffItem<LineDecoration>;
    }
  ) => void;
  enableGutterUtility?: boolean;
  enableLineSelection?: boolean;
  onToggleItemCollapsed?: (itemId: string) => void;
  ref: RefObject<CodeViewHandle<LineDecoration> | null>;
  renderAnnotation?: (
    annotation:
      | LineAnnotation<LineDecoration>
      | DiffLineAnnotation<LineDecoration>
  ) => ReactNode;
  renderHeaderMetadata?: (item: CodeViewItem<LineDecoration>) => ReactNode;
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

  const options = useMemo<CodeViewOptions<LineDecoration>>(
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
      className="scrollbar-thin scrollbar-thumb-foreground/20 scrollbar-track-transparent overflow-auto overscroll-contain [&_diffs-container]:scheme-light dark:[&_diffs-container]:scheme-dark"
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
