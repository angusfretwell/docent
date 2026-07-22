/**
 * The runtime-neutral patch/blob primitives the drift read and its diff callers
 * lean on: `isRealObjectId` (a git object id names real content),
 * `parsePatchBlocks` (split a raw patch into per-file blocks), and `formatBytes`
 * (human-readable byte sizes). Runtime-neutral: no Bun or DOM globals, so the
 * client and the tests exercise the same code.
 */

/** Whether an object id names real content — a null id (all zeros) has no blob. */
export function isRealObjectId(id?: string): id is string {
  return id !== undefined && !/^0+$/.test(id);
}

// Split a raw unified patch into one block per file. Blocks begin at a
// column-0 `diff --git ` line; content lines are prefixed (`+`/`-`/space), so a
// file whose own content contains `diff --git` never triggers a false split.
const DIFF_HEADER = /^diff --git /m;

/**
 * Split a raw unified patch into its per-file blocks, in patch order — the same
 * order `processPatch` returns files, so the two zip by index.
 */
export function parsePatchBlocks(patch: string): string[] {
  if (patch.trim() === "") {
    return [];
  }
  const blocks: string[] = [];
  const parts = patch.split(DIFF_HEADER);
  for (const part of parts) {
    if (part === "") {
      continue;
    }
    blocks.push(`diff --git ${part}`);
  }
  return blocks;
}

// Powers-of-1024 units; binaries are byte-counted, so KB/MB read naturally.
const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

/** Human-readable byte size for the binary size-delta chrome, e.g. `1.2 KB`. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}
