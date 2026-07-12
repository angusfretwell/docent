/**
 * The pure quote-highlighting split behind the Product walkthrough tab's
 * inline prose marks (walkthroughs.md §7): a text-span Finding's quote is
 * rendered highlighted **into** the section prose it anchors, not merely
 * listed beside it. Splits a prose run into plain-text and quote segments so
 * `product-walkthrough-view.tsx` can render each quote segment as a `<mark>`.
 * Quotes absent from the text are dropped up front; at each step the earliest
 * remaining match wins, so overlapping quotes never double-highlight the same
 * span. No React here — this is the pure segmentation the view renders.
 */

export type ProseSegment =
  | { kind: "text"; text: string }
  | { kind: "quote"; text: string };

/**
 * Split `text` into segments, marking each `quotes` entry's first occurrence.
 * A quote with no match (empty, or absent from `text`) is skipped — it still
 * lists as a note above the body, just not highlighted in place.
 */
export function highlightQuotes(
  text: string,
  quotes: readonly string[]
): ProseSegment[] {
  const active = quotes.filter(
    (quote) => quote.length > 0 && text.includes(quote)
  );
  if (active.length === 0) {
    return [{ kind: "text", text }];
  }

  const segments: ProseSegment[] = [];
  let rest = text;
  while (rest.length > 0) {
    let at = -1;
    let quote = "";
    for (const candidate of active) {
      const index = rest.indexOf(candidate);
      if (index !== -1 && (at === -1 || index < at)) {
        at = index;
        quote = candidate;
      }
    }
    if (at === -1) {
      segments.push({ kind: "text", text: rest });
      break;
    }
    if (at > 0) {
      segments.push({ kind: "text", text: rest.slice(0, at) });
    }
    segments.push({ kind: "quote", text: quote });
    rest = rest.slice(at + quote.length);
  }
  return segments;
}
