/**
 * The shared on-disk record envelope: a YAML frontmatter block over a trimmed
 * markdown body (`---\n…\n---\n<body>`), the greppable shape the read path parses
 * back (data-model.md §5.1–5.2). One serializer for every frontmatter-over-body
 * file — Finding records (`findings-write.ts`) and walkthrough sections
 * (`walkthrough-write.ts`) — so the two write paths never re-spell the envelope.
 */

/**
 * Serialize an ordered list of frontmatter fields into the block-style envelope:
 * one `key: value` line per field, with nested objects/arrays rendered flow-style
 * by `Bun.YAML.stringify` (so an anchor or a range list stays a single greppable
 * line). Absent optional fields (`value === undefined`) are dropped, and key
 * order is the caller's insertion order.
 */
export function serializeFrontmatter(ordered: readonly [string, unknown][]): string {
  return ordered
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${Bun.YAML.stringify(value).trim()}`)
    .join("\n");
}

/** Wrap a serialized frontmatter block over a trimmed markdown body. */
export function recordFile(frontmatter: string, body: string): string {
  const trimmed = body.trim();
  const bodyBlock = trimmed === "" ? "" : `\n${trimmed}\n`;
  return `---\n${frontmatter}\n---\n${bodyBlock}`;
}
