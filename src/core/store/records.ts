/**
 * The shared on-disk record envelope: a YAML frontmatter block over a trimmed
 * markdown body (`---\n…\n---\n<body>`), the greppable shape (data-model.md
 * §5.1–5.2). This module owns **both** directions — the serializer every write
 * path emits (Finding records in `core/findings-write.ts`, walkthrough
 * sections in `core/walkthrough-write.ts`) and the parser every read path
 * splits back apart (the snapshot reader in `core/review.ts` and the
 * `docent validate` oracle in `core/validate.ts`) — so the envelope shape
 * is spelled in exactly one place.
 */

import { recordTypes } from "@shared/enums/record-type";
import { Effect } from "effect";

/**
 * Serialize an ordered list of frontmatter fields into the block-style envelope:
 * one `key: value` line per field, with nested objects/arrays rendered flow-style
 * by `Bun.YAML.stringify` (so an anchor or a range list stays a single greppable
 * line). Absent optional fields (`value === undefined`) are dropped, and key
 * order is the caller's insertion order.
 */
export function serializeFrontmatter(
  ordered: readonly [string, unknown][]
): string {
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

/**
 * Split a frontmatter-over-markdown file into its YAML frontmatter block and its
 * markdown body — tolerant of `\r\n` line endings and an optional trailing
 * newline before the body. A file without the `---` fences yields an empty
 * frontmatter and the whole text as body, so a caller decoding the frontmatter
 * fails cleanly rather than misreading a bodyless file.
 */
export const FRONTMATTER =
  /^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n?---\r?\n?(?<body>[\s\S]*)$/;

/**
 * Parse a frontmatter-over-markdown file into its YAML `meta` and trimmed
 * `body` — the shared envelope of Finding records and walkthrough sections
 * (data-model.md §5.1). A file without `---` fences yields an empty `meta`, so
 * the caller's schema decode fails and the record is flagged (or, in the
 * best-effort reader, skipped). The `Bun.YAML.parse` is wrapped so a malformed
 * frontmatter surfaces as a typed failure, never a thrown defect.
 */
export const splitEnvelope = Effect.fn("splitEnvelope")(function* splitEnvelope(
  text: string
) {
  const match = FRONTMATTER.exec(text);
  const frontmatter = match?.groups?.frontmatter ?? "";
  const body = (match?.groups?.body ?? "").trim();
  const meta = yield* Effect.try(() => Bun.YAML.parse(frontmatter) ?? {});
  return { body, meta: meta as object };
});

// A Finding record filename is `NNN-<type>.md`; the type suffix is the record
// type (the frontmatter carries no type field — data-model.md §5.1). The
// vocabulary is owned by `enums/record-type.ts`, so the pattern is derived from it.
const RECORD_NAME = new RegExp(`^\\d+-(?<type>${recordTypes.join("|")})\\.md$`);

/**
 * The record type a Finding record filename encodes (`002-reply.md` → `reply`),
 * or `undefined` when the name is not a `NNN-<type>.md` record — which then
 * fails to decode against the schema's `type` field.
 */
export function recordType(name: string): string | undefined {
  return RECORD_NAME.exec(name)?.groups?.type;
}
