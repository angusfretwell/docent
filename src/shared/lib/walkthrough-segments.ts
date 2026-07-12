/**
 * The prose/target interleave for the Code and Product walkthrough tabs
 * (walkthroughs.md §5). Runtime-neutral and drift-free: no Bun or DOM globals and
 * no anchor/drift dependency, so the server and the client share one definition
 * and each fold below is a plain unit-tested function. The walkthrough schemas
 * themselves live in `schemas/walkthrough.ts`; drift lives in the sibling
 * `identity-drift`/`walkthrough-annotations` folds.
 */

/**
 * One placed piece of a section body: a run of prose, or a target by index — a
 * code `range` or a product `capture`. The target kind mirrors the section kind;
 * a section only ever emits one target kind.
 */
export type Segment =
  | { kind: "prose"; text: string }
  | { kind: "range"; index: number }
  | { kind: "capture"; index: number };

// The literate `{{range:i}}` / `{{capture:i}}` markers; `i` is a position in the
// frontmatter target list. Global so `exec` walks every occurrence.
const RANGE_MARKER = /\{\{range:(?<index>\d+)\}\}/g;
const CAPTURE_MARKER = /\{\{capture:(?<index>\d+)\}\}/g;

/**
 * Fold a section body into its rendered segments against one marker kind
 * (walkthroughs.md §5):
 *
 * - **No valid markers ⇒** the prose, then every target in index order (the flat
 *   fallback).
 * - **Markers present ⇒** prose and targets interleave in document order; a
 *   marker whose index is out of range stays literal prose; any target left
 *   unreferenced appends after, in index order, so no target is silently
 *   dropped.
 *
 * Prose runs are trimmed and empty runs elided, so adjacent markers don't emit
 * blank prose between them. The other kind's marker is inert here — it isn't
 * matched, so it survives as literal prose (a `{{capture:i}}` in a code body, or
 * vice versa, is never a target).
 */
function interleave(
  body: string,
  count: number,
  marker: RegExp,
  targetKind: "range" | "capture"
): Segment[] {
  const segments: Segment[] = [];
  const referenced = new Set<number>();
  let cursor = 0;

  function pushProse(raw: string) {
    const text = raw.trim();
    if (text !== "") {
      segments.push({ kind: "prose", text });
    }
  }
  function pushTarget(index: number) {
    segments.push(
      targetKind === "range"
        ? { index, kind: "range" }
        : { index, kind: "capture" }
    );
  }

  marker.lastIndex = 0;
  for (
    let match = marker.exec(body);
    match !== null;
    match = marker.exec(body)
  ) {
    const index = Number(match.groups?.index);
    if (index >= count) {
      // Out of range: leave the marker text in place as literal prose.
      continue;
    }
    pushProse(body.slice(cursor, match.index));
    pushTarget(index);
    referenced.add(index);
    cursor = match.index + match[0].length;
  }
  pushProse(body.slice(cursor));

  // No marker placed any target: prose already pushed, append every target.
  if (referenced.size === 0) {
    for (let index = 0; index < count; index += 1) {
      pushTarget(index);
    }
    return segments;
  }

  // Some targets went unreferenced: append them after, in index order.
  for (let index = 0; index < count; index += 1) {
    if (!referenced.has(index)) {
      pushTarget(index);
    }
  }
  return segments;
}

/** Fold a code section body over its `{{range:i}}` markers (walkthroughs.md §5). */
export function interleaveSegments(
  body: string,
  rangeCount: number
): Segment[] {
  return interleave(body, rangeCount, RANGE_MARKER, "range");
}

/** Fold a product section body over its `{{capture:i}}` markers (walkthroughs.md §5). */
export function interleaveCaptureSegments(
  body: string,
  captureCount: number
): Segment[] {
  return interleave(body, captureCount, CAPTURE_MARKER, "capture");
}
