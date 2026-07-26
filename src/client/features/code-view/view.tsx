import type { LineDecoration } from "@client/lib/diff-annotations";
import { diffLayoutAtom, wordWrapAtom } from "@client/lib/preferences";
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
import type { CodeViewHandle, CodeViewProps } from "@pierre/diffs/react";
import { useAtomValue } from "jotai/react";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { CodeViewFocus } from "./focus";
import { FOCUS_CSS, paintFocus } from "./focus";
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
  disableBackground?: boolean;
  /** Lines to hold the reader's eye, dimming everything else. */
  focus?: CodeViewFocus | null;
  onScroll?: CodeViewProps<LineDecoration>["onScroll"];
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
  disableBackground,
  focus = null,
  onScroll,
  onToggleItemCollapsed,
  ref,
  renderAnnotation,
  renderHeaderMetadata,
}: AnnotatedCodeViewProps) {
  const diffLayout = useAtomValue(diffLayoutAtom);
  const wordWrap = useAtomValue(wordWrapAtom);

  // Read through a ref so the callback below can stay referentially stable: a
  // new identity re-creates the options, which re-renders every item.
  const focusRef = useRef(focus);

  const handlePostRender = useCallback<
    NonNullable<CodeViewOptions<LineDecoration>["onPostRender"]>
  >((node, instance, phase, context) => {
    if (phase === "unmount" || !("getLineIndex" in instance)) {
      return;
    }

    paintFocus(node, instance, context.item.id, focusRef.current);
  }, []);

  // Keyed by value, not identity: callers build the focus inline, so depending
  // on the object would repaint on every render of the parent.
  const focusKey =
    focus === null
      ? ""
      : `${focus.itemId}:${focus.lines.join("-")}:${focus.side}`;

  // Items already on screen don't re-render when the focus moves, so they are
  // repainted here; ones scrolling in are covered by the post-render callback.
  useEffect(() => {
    focusRef.current = focus;

    for (const rendered of ref.current?.getInstance()?.getRenderedItems() ??
      []) {
      if (rendered.type === "diff") {
        paintFocus(rendered.element, rendered.instance, rendered.id, focus);
      }
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ref]);

  const options = useMemo<CodeViewOptions<LineDecoration>>(
    () => ({
      diffStyle: diffLayout,
      disableBackground,
      disableVirtualizationBuffers: true,
      enableGutterUtility,
      enableLineSelection,
      layout: { gap: 0, paddingBottom: 0, paddingTop: 0 },
      onGutterUtilityClick,
      onPostRender: handlePostRender,
      overflow: wordWrap ? "wrap" : "scroll",
      stickyHeaders: true,
      unsafeCSS: `${DIFFS_CSS}\n${FOCUS_CSS}`,
    }),
    [
      diffLayout,
      disableBackground,
      enableGutterUtility,
      enableLineSelection,
      handlePostRender,
      onGutterUtilityClick,
      wordWrap,
    ]
  );

  return (
    <BaseCodeView
      ref={ref}
      items={items}
      className="scrollbar-thin scrollbar-thumb-foreground/20 scrollbar-track-transparent overflow-auto overscroll-contain [&_diffs-container]:scheme-light dark:[&_diffs-container]:scheme-dark"
      onScroll={onScroll}
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
