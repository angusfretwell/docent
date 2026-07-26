import type { SelectionSide } from "@pierre/diffs";

/** The lines a walkthrough step is pointing at. */
export interface CodeViewFocus {
  itemId: string;
  lines: readonly [number, number];
  side: SelectionSide;
}

/**
 * Pointing is deliberately not line selection: the library pins the gutter
 * comment button to a selection and holds only one, so driving it from the
 * walkthrough would take the reader's only means of commenting.
 */
export const FOCUS_CSS = `
  /* The dim lifts across a file the moment the reader selects in it, so their
     own selection never reads as faded. The band keeps its tint throughout. */
  :host([data-focus-mode]) pre:not(:has([data-selected-line])) [data-line]:not([data-focus-line]),
  :host([data-focus-mode]) pre:not(:has([data-selected-line])) [data-column-number]:not([data-focus-line]) {
    opacity: .5;
  }

  :host([data-focus-mode]) [data-focus-line] {
    box-shadow: inset 0 0 0 100vmax color-mix(in srgb, var(--primary) 8%, transparent);
  }
`;

interface LineIndexed {
  getLineIndex: (
    lineNumber: number,
    side?: SelectionSide
  ) => [number, number] | undefined;
}

/** `data-line-index` carries "unified,split" on split rows, unified alone otherwise. */
function rowIndex(element: HTMLElement, split: boolean): number | undefined {
  const indexes = (element.dataset.lineIndex ?? "")
    .split(",")
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => !Number.isNaN(value));

  if (split && indexes.length === 2) {
    return indexes[1];
  }

  return split ? undefined : indexes[0];
}

/**
 * Mark one item's focused lines, dimming the rest of that item and — with no
 * focus of its own — the whole of every other item.
 *
 * Safe to call on every render pass, and it has to be: virtualization rebuilds
 * rows as they scroll into view, so the marks are re-stamped rather than set
 * once.
 */
export function paintFocus(
  host: HTMLElement,
  instance: LineIndexed,
  itemId: string,
  focus: CodeViewFocus | null
) {
  const root = host.shadowRoot;
  if (root === null) {
    return;
  }

  for (const marked of root.querySelectorAll<HTMLElement>(
    "[data-focus-line]"
  )) {
    delete marked.dataset.focusLine;
  }

  host.toggleAttribute("data-focus-mode", focus !== null);

  const pre = root.querySelector("pre");
  if (focus === null || focus.itemId !== itemId || pre === null) {
    return;
  }

  const split = pre.dataset.diffType === "split";
  const start = instance.getLineIndex(focus.lines[0], focus.side);
  const end = instance.getLineIndex(focus.lines[1], focus.side);
  if (start === undefined || end === undefined) {
    return;
  }

  const column = split ? 1 : 0;
  const first = Math.min(start[column], end[column]);
  const last = Math.max(start[column], end[column]);

  for (const code of pre.querySelectorAll("[data-code]")) {
    const [gutter, content] = code.children;
    if (gutter === undefined || content === undefined) {
      continue;
    }

    for (const [index, row] of [...content.children].entries()) {
      const cell = gutter.children[index];
      if (!(row instanceof HTMLElement && cell instanceof HTMLElement)) {
        continue;
      }

      const line = rowIndex(row, split);
      if (line === undefined || line < first) {
        continue;
      }
      if (line > last) {
        break;
      }

      row.dataset.focusLine = "";
      cell.dataset.focusLine = "";
    }
  }
}
