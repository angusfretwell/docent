import type { CodeViewFocus } from "@client/features/code-view/focus";
import type { DiffFile } from "@client/lib/diff";
import type { LineDecoration } from "@client/lib/diff-annotations";
import { rendersRange } from "@client/lib/diff-target";
import type {
  CodeView,
  CodeViewRenderedDiffItem,
  CodeViewScrollTarget,
  SelectionSide,
} from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { WalkthroughRange } from "@shared/schemas/walkthrough";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

/** An aim centres its range, so the centre is where the diff already says "here". */
const READ_LINE_FRACTION = 1 / 2;

/** An aimed scroll is over once its frames stop landing. */
const QUIET_MS = 200;

/** Backstop for an aim with nowhere to travel, which fires no scroll at all. */
const SETTLE_MS = 1000;

function sideOf(range: WalkthroughRange): SelectionSide {
  return range.side === "base" ? "deletions" : "additions";
}

/**
 * Whether the viewer can answer where a range sits. Asked for a line it never
 * rendered, it extrapolates a position rather than declining, so the answer
 * reads as real while pointing nowhere near the range.
 *
 * The gaps are rendered only when the file has both its blobs *and* the caller
 * asked for them: expansion supplies the lines, `expandUnchanged` puts them on
 * screen, and neither alone is enough.
 */
function canPlace(
  file: DiffFile,
  range: WalkthroughRange,
  expandUnchanged: boolean
): boolean {
  if (expandUnchanged && !file.file.isPartial) {
    return true;
  }

  return rendersRange(file.file, range.side, range.lines);
}

/**
 * Where an aim travels. A line the viewer never rendered resolves to an invented
 * row, so an aim it cannot place travels to the file and waits: the blobs land,
 * the file expands, and the effect runs again with somewhere real to point.
 */
function aimFor({
  id,
  line,
  placeable,
  side,
}: {
  id: string;
  line: number;
  placeable: boolean;
  side: SelectionSide;
}): CodeViewScrollTarget {
  if (!placeable) {
    return { align: "start", behavior: "smooth-auto", id, type: "item" };
  }

  return {
    align: "center",
    behavior: "smooth-auto",
    id,
    lineNumber: line,
    side,
    type: "line",
  };
}

/** A range's extent in the scroller's own coordinates, so it can be compared against the scroll position. */
function bandFor(
  item: CodeViewRenderedDiffItem<LineDecoration>,
  itemTop: number,
  range: WalkthroughRange
): { bottom: number; top: number } | undefined {
  const side = sideOf(range);
  const start = item.instance.getLinePosition(range.lines[0], side);
  const end = item.instance.getLinePosition(range.lines[1], side);

  if (start === undefined || end === undefined) {
    return;
  }

  return {
    bottom: itemTop + Math.max(start.top + start.height, end.top + end.height),
    top: itemTop + Math.min(start.top, end.top),
  };
}

/**
 * The middle of the viewport, sliding to its bottom as the scroller runs out of
 * travel: a tour's closing ranges can never be brought to the middle, so a fixed
 * line would leave them permanently unreachable.
 */
function readTopOf(viewer: CodeView<LineDecoration>): number {
  const container = viewer.getContainerElement();
  const scrollTop = viewer.getScrollTop();
  const height = container?.clientHeight ?? viewer.getHeight();
  const middle = height * READ_LINE_FRACTION;
  const remaining = (container?.scrollHeight ?? height) - height - scrollTop;

  return scrollTop + middle + Math.max(0, middle - remaining);
}

/**
 * The range the diff has been read down to: the last one whose start has passed
 * the reading line and that is still on screen. Once every range has scrolled
 * away — a long stretch of code the tour never points at — it answers with
 * nothing, and the prose holds where the reader left it.
 */
function rangeUnderRead(
  viewer: CodeView<LineDecoration>,
  ranges: ReadonlyMap<string, WalkthroughRange>,
  filesByPath: ReadonlyMap<string, DiffFile>
): string | undefined {
  const viewTop = viewer.getScrollTop();
  const viewBottom =
    viewTop + (viewer.getContainerElement()?.clientHeight ?? 0);
  const readTop = readTopOf(viewer);

  let reached: { key: string; top: number } | undefined;

  for (const item of viewer.getRenderedItems()) {
    const itemTop = viewer.getTopForItem(item.id);

    if (item.type !== "diff" || itemTop === undefined) {
      continue;
    }

    for (const [key, range] of ranges) {
      const file = filesByPath.get(range.file);

      if (file === undefined || file.id !== item.id) {
        continue;
      }

      // Read off the item the measurement is taken from, so this cannot answer
      // for a viewer configured differently from the one on screen. A hunk the
      // reader expanded by hand is not visible here and reads as unplaceable,
      // which costs a report rather than inventing one.
      if (
        !canPlace(file, range, item.instance.options.expandUnchanged === true)
      ) {
        continue;
      }

      const band = bandFor(item, itemTop, range);
      const onScreen =
        band !== undefined && band.bottom >= viewTop && band.top <= viewBottom;

      if (!onScreen || band.top > readTop) {
        continue;
      }

      if (reached === undefined || band.top > reached.top) {
        reached = { key, top: band.top };
      }
    }
  }

  return reached?.key;
}

export interface DiffAim {
  /** The active range's lines, for the panel to hold the reader's eye on. */
  focus: CodeViewFocus | null;
  onScroll: (scrollTop: number, viewer: CodeView<LineDecoration>) => void;
}

/**
 * Keeps the diff and the tour's active target pointed at each other: an aim
 * scrolls the diff to the range the prose reached, and reading the diff reports
 * the range it arrives at back.
 *
 * The two would otherwise chase each other, so an aim's own scroll frames are
 * ignored until they stop landing, and an aim the reader already scrolled to
 * themselves is dropped rather than re-asserted over the top of them.
 */
export function useDiffAim({
  activeKey,
  expandUnchanged,
  files,
  onReach,
  ranges,
  reasserted,
  viewRef,
}: {
  activeKey: string | undefined;
  /**
   * Whatever the same caller hands the code view. An aim is taken before the
   * target is rendered, so unlike a measurement it has no item to ask.
   */
  expandUnchanged: boolean;
  files: DiffFile[];
  onReach: (key: string) => void;
  ranges: ReadonlyMap<string, WalkthroughRange>;
  /** Bumped to re-aim at the range already active. */
  reasserted: number;
  viewRef: RefObject<CodeViewHandle<LineDecoration> | null>;
}): DiffAim {
  const arriving = useRef(false);
  const frame = useRef(0);
  const quiet = useRef(0);
  const settle = useRef(0);

  const reached = useRef<{ key: string; reasserted: number } | null>(null);

  const latest = useRef({
    activeKey,
    filesByPath: new Map<string, DiffFile>(),
    onReach,
    ranges,
    reasserted,
  });

  useEffect(() => {
    latest.current = {
      activeKey,
      filesByPath: new Map(files.map((file) => [file.path, file])),
      onReach,
      ranges,
      reasserted,
    };
  });

  const stopArriving = useCallback(() => {
    window.clearTimeout(quiet.current);
    window.clearTimeout(settle.current);
    arriving.current = false;
  }, []);

  const pushQuiet = useCallback(() => {
    window.clearTimeout(quiet.current);
    quiet.current = window.setTimeout(stopArriving, QUIET_MS);
  }, [stopArriving]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      stopArriving();
    },
    [stopArriving]
  );

  const activeRange =
    activeKey === undefined ? undefined : ranges.get(activeKey);

  const targetFile = files.find((file) => file.path === activeRange?.file);
  const targetId = targetFile?.id;
  const targetLine = activeRange?.lines[0];
  const targetEndLine = activeRange?.lines[1];
  const targetSide: SelectionSide =
    activeRange === undefined ? "additions" : sideOf(activeRange);

  // Expanding the file moves every row below the gap, so an aim taken while it
  // was partial now points above where the range sits.
  const aimedWhilePartial = targetFile?.file.isPartial;

  const canPlaceTarget =
    targetFile !== undefined &&
    activeRange !== undefined &&
    canPlace(targetFile, activeRange, expandUnchanged);

  useEffect(() => {
    const self = reached.current;
    const sameAim =
      self !== null && self.key === activeKey && self.reasserted === reasserted;

    // Only a change of aim retires the reader's own scroll; re-aiming the same
    // range after an expansion must still defer to where they scrolled to.
    if (!sameAim) {
      reached.current = null;
    }

    if (
      targetId === undefined ||
      targetLine === undefined ||
      targetEndLine === undefined
    ) {
      return;
    }

    if (sameAim) {
      return;
    }

    arriving.current = true;
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(stopArriving, SETTLE_MS);
    pushQuiet();

    viewRef.current?.scrollTo(
      aimFor({
        id: targetId,
        line: targetLine,
        placeable: canPlaceTarget,
        side: targetSide,
      })
    );
  }, [
    activeKey,
    aimedWhilePartial,
    canPlaceTarget,
    pushQuiet,
    reasserted,
    stopArriving,
    targetEndLine,
    targetId,
    targetLine,
    targetSide,
    viewRef,
  ]);

  const measure = useCallback((viewer: CodeView<LineDecoration>) => {
    const reading = latest.current;

    // Before the tour has an active target the diff is still settling into its
    // opening position, which is nowhere the reader has read to.
    if (arriving.current || reading.activeKey === undefined) {
      return;
    }

    const key = rangeUnderRead(viewer, reading.ranges, reading.filesByPath);

    if (key === undefined || key === reading.activeKey) {
      return;
    }

    reached.current = { key, reasserted: reading.reasserted };
    reading.onReach(key);
  }, []);

  /* The viewer notifies its scroll listeners before it re-renders, so right
     after a jump `getRenderedItems()` still describes where the diff was.
     Reading two frames out lands after the render that answers the jump; a
     reading already queued is left to run, so a continuous scroll keeps
     reporting instead of deferring itself until the reader stops. */
  const onScroll = useCallback(
    (_scrollTop: number, viewer: CodeView<LineDecoration>) => {
      if (arriving.current) {
        pushQuiet();
        return;
      }

      if (frame.current !== 0) {
        return;
      }

      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          measure(viewer);
        });
      });
    },
    [measure, pushQuiet]
  );

  // Painting reaches for the same invented rows the aim does, so an unplaceable
  // range marks nothing rather than holding the reader's eye on the wrong lines.
  const focus: CodeViewFocus | null =
    targetId === undefined ||
    targetLine === undefined ||
    targetEndLine === undefined ||
    !canPlaceTarget
      ? null
      : {
          itemId: targetId,
          lines: [targetLine, targetEndLine],
          side: targetSide,
        };

  return { focus, onScroll };
}
