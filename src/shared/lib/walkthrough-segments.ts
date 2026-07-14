/**
 * The prose/target fold for the Code and Product walkthrough tabs
 * (walkthroughs.md §5). Runtime-neutral and drift-free: no Bun or DOM globals and
 * no anchor/drift dependency, so the server and the client share one definition
 * and each fold below is a plain unit-tested function. The walkthrough schemas
 * themselves live in `schemas/walkthrough.ts`; drift lives in the sibling
 * `identity-drift`/`walkthrough-annotations` folds.
 */

/** One section body prepared for rendering, against one marker kind. */
export interface SectionFold {
  /** Target indices a marker placed in the prose, in document order. */
  placed: number[];
  /** The body, with each placed marker rewritten to its chip link. */
  prose: string;
  /** Target indices no marker placed, in index order. */
  trailing: number[];
}

// The literate `{{range:i}}` / `{{capture:i}}` markers; `i` is a position in the
// frontmatter target list. Global so `replaceAll` walks every occurrence.
const RANGE_MARKER = /\{\{range:(?<index>\d+)\}\}/g;
const CAPTURE_MARKER = /\{\{capture:(?<index>\d+)\}\}/g;

const CHIP_HREF = /^#walkthrough-target-(?<index>\d+)$/;

/**
 * The href a placed marker is rewritten to, read back by `targetChipIndex`.
 *
 * A fragment rather than a custom scheme because react-markdown's
 * `defaultUrlTransform` blanks any URL whose protocol is outside its safe list,
 * and a `docent:0` would be read as exactly that. A URL with no colon is treated
 * as relative and passed through untouched.
 */
export function targetChipHref(index: number): string {
  return `#walkthrough-target-${index}`;
}

/** The target index a chip href carries, or `undefined` for an ordinary link. */
export function targetChipIndex(href: string): number | undefined {
  const match = CHIP_HREF.exec(href);

  return match === null ? undefined : Number(match.groups?.index);
}

/**
 * Fold a section body against one marker kind, rewriting each marker that names
 * a real target into an inline chip link and reporting which targets that left
 * unplaced.
 *
 * The marker is rewritten rather than split on. Splitting the body at the marker
 * offset is right when the target renders inline — the author put it
 * mid-sentence deliberately — but these targets render in a panel beside the
 * prose, so each fragment becomes its own markdown block and the sentence is
 * torn in half with whatever punctuation followed the marker dangling at the
 * start of the next. Rewriting keeps the body one block, so the paragraph
 * survives intact *and* the marker keeps a real position for its chip to occupy
 * and for the active-target reading to key off.
 *
 * A marker naming a target the section doesn't have stays literal prose, and a
 * target no marker placed comes back in `trailing` so nothing is silently
 * dropped. The other kind's marker is inert here — it isn't matched, so a
 * `{{capture:i}}` in a code body survives as prose, and vice versa.
 */
function foldSection(body: string, count: number, marker: RegExp): SectionFold {
  const placed: number[] = [];

  marker.lastIndex = 0;
  const prose = body.replaceAll(marker, (match, digits: string) => {
    const index = Number(digits);

    if (index >= count) {
      return match;
    }

    if (!placed.includes(index)) {
      placed.push(index);
    }

    return `[](${targetChipHref(index)})`;
  });

  const trailing: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (!placed.includes(index)) {
      trailing.push(index);
    }
  }

  return { placed, prose: prose.trim(), trailing };
}

/** Fold a code section body over its `{{range:i}}` markers (walkthroughs.md §5). */
export function foldRangeSection(
  body: string,
  rangeCount: number
): SectionFold {
  return foldSection(body, rangeCount, RANGE_MARKER);
}

/** Fold a product section body over its `{{capture:i}}` markers (walkthroughs.md §5). */
export function foldCaptureSection(
  body: string,
  captureCount: number
): SectionFold {
  return foldSection(body, captureCount, CAPTURE_MARKER);
}
