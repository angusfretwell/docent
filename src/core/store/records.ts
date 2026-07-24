/**
 * The on-disk record envelope — YAML frontmatter over a trimmed markdown body —
 * spelled once for both the write (serialize) and read (split) paths.
 */

import { recordTypes } from "@shared/enums/record-type";
import { Effect } from "effect";

import { parseYaml } from "./parse";

/**
 * Nested objects/arrays render flow-style, so an anchor or range list stays a
 * single greppable line. Absent optional fields are dropped; key order follows
 * the caller's insertion order.
 */
export function serializeFrontmatter(
  ordered: readonly [string, unknown][]
): string {
  return ordered
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${Bun.YAML.stringify(value).trim()}`)
    .join("\n");
}

export function recordFile(frontmatter: string, body: string): string {
  const trimmed = body.trim();
  const bodyBlock = trimmed === "" ? "" : `\n${trimmed}\n`;
  return `---\n${frontmatter}\n---\n${bodyBlock}`;
}

/**
 * Tolerant of `\r\n` and an optional trailing newline. A file without `---`
 * fences yields empty frontmatter (and all text as body), so the caller's decode
 * fails cleanly rather than misreading a bodyless file.
 */
export const FRONTMATTER =
  /^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n?---\r?\n?(?<body>[\s\S]*)$/;

/**
 * A file without `---` fences yields an empty `meta`, so the caller's decode
 * fails (flagged by validate, skipped by the best-effort reader).
 */
export const splitEnvelope = Effect.fn("splitEnvelope")(function* splitEnvelope(
  text: string
) {
  const match = FRONTMATTER.exec(text);
  const frontmatter = match?.groups?.frontmatter ?? "";
  const body = (match?.groups?.body ?? "").trim();
  const meta = yield* parseYaml(frontmatter);
  return { body, meta: (meta ?? {}) as object };
});

// A Finding record's type comes from its `NNN-<type>.md` filename — the
// frontmatter carries no type field. Vocabulary owned by `enums/record-type.ts`.
const RECORD_NAME = new RegExp(`^\\d+-(?<type>${recordTypes.join("|")})\\.md$`);

export function recordType(name: string): string | undefined {
  return RECORD_NAME.exec(name)?.groups?.type;
}
