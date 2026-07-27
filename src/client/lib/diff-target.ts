import type { DiffFile } from "@client/lib/diff";
import type { DriftResult } from "@client/lib/drift";
import { createRevealTarget } from "@client/lib/reveal-target";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { Side } from "@shared/enums/side";
import type { Anchor } from "@shared/schemas/comment";

/** A line of a file diff, numbered against the side it is read on. */
export interface DiffLine {
  number: number;
  side: Side;
}

/** A file in the change, and the line inside it when the patch renders one. */
export interface DiffTarget {
  id: string;
  line?: DiffLine;
}

const diffReveal = createRevealTarget<DiffTarget>();

export const diffTargetAtom = diffReveal.targetAtom;

export const useRevealDiffTarget = diffReveal.useReveal;

function fileFor(
  files: readonly DiffFile[],
  path: string
): DiffFile | undefined {
  return files.find(
    (entry) => entry.path === path || entry.file.prevName === path
  );
}

// A patch carries only its hunks, so a line outside every one of them has no row
// to land on: the viewer resolves it to nothing, or to a row it does not mean.
function rendersLine(
  fileDiff: FileDiffMetadata,
  side: Side,
  line: number
): boolean {
  return fileDiff.hunks.some((hunk) => {
    const start = side === "head" ? hunk.additionStart : hunk.deletionStart;
    const count = side === "head" ? hunk.additionCount : hunk.deletionCount;

    return line >= start && line < start + count;
  });
}

export function rendersRange(
  fileDiff: FileDiffMetadata,
  side: Side,
  lines: readonly [number, number]
): boolean {
  return (
    rendersLine(fileDiff, side, lines[0]) &&
    rendersLine(fileDiff, side, lines[1])
  );
}

// Drift decides where a line anchor stands, the rule the inline annotation
// follows too, so a jump lands on the row the comment is drawn against. Outdated
// code stands nowhere in the change, and drift still resolving not yet anywhere.
function standingLine(
  anchor: Extract<Anchor, { kind: "line" }>,
  drift: DriftResult | undefined,
  fileDiff: FileDiffMetadata
): number | undefined {
  if (drift === undefined || drift.state === "outdated") {
    return undefined;
  }

  const line = drift.lines?.[0] ?? anchor.lines[0];

  return rendersLine(fileDiff, anchor.side, line) ? line : undefined;
}

/**
 * Where a comment sits in the diff: its file, and the line its anchor stands on
 * wherever the diff shows one. `anchorFile` is the fallback path for a record
 * whose anchor never decoded, so such a comment still reaches its file.
 */
export function anchorDiffTarget(params: {
  anchor?: Anchor;
  anchorFile?: string;
  drift?: DriftResult;
  files: readonly DiffFile[];
}): DiffTarget | undefined {
  const { anchor, anchorFile, drift, files } = params;

  const path =
    anchor?.kind === "line" || anchor?.kind === "file"
      ? anchor.file
      : anchorFile;

  if (path === undefined) {
    return undefined;
  }

  const file = fileFor(files, path);

  if (file === undefined) {
    return undefined;
  }

  if (anchor?.kind === "line") {
    const line = standingLine(anchor, drift, file.file);

    if (line !== undefined) {
      return { id: file.id, line: { number: line, side: anchor.side } };
    }
  }

  return { id: file.id };
}
