export function isRealObjectId(id?: string): id is string {
  return id !== undefined && !/^0+$/.test(id);
}

/** Content lines are prefixed (+/-/space), so a file whose own content contains `diff --git` never triggers a false split. */
const DIFF_HEADER = /^diff --git /m;

/**
 * Blocks in patch order, which is what callers mint stable per-file ids from.
 * Whatever precedes the first header is commit metadata, not a file, so the
 * leading split part is always discarded.
 */
export function parsePatchBlocks(patch: string): string[] {
  const [, ...parts] = patch.split(DIFF_HEADER);

  return parts.map((part) => `diff --git ${part}`);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

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
