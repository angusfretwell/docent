/**
 * Anchor construction for the write path: turn an `AnchorSpec` — how a caller
 * names an anchor before git is consulted — into a schema `Anchor`, resolving
 * the code arms' content-addressed `blobSha` from git at the written Change's
 * refs. Operation logic, not argv parsing, so it lives beside the git
 * resolution it drives; the CLI's `finding add` is its consumer today, and any
 * future surface minting anchors shares this one implementation.
 */

import type { Side } from "@shared/enums/side";
import type { Anchor } from "@shared/schemas/finding";
import { Effect } from "effect";

import { resolveBlobShaAt } from "./resolve";

/** How a write names the anchor before git resolves any `blobSha`. */
export type AnchorSpec =
  | { kind: "change" }
  | { file: string; kind: "file"; side: Side }
  | { file: string; kind: "line"; lines: [number, number]; side: Side }
  | { anchor: Anchor; kind: "raw" };

/** Turn an `AnchorSpec` into a schema anchor, resolving code-arm `blobSha`s. */
export const buildAnchor = Effect.fn("buildAnchor")(
  function* buildAnchor(params: {
    root: string;
    baseSha: string;
    headSha: string;
    spec: AnchorSpec;
  }) {
    const { spec } = params;
    if (spec.kind === "raw") {
      return spec.anchor;
    }
    if (spec.kind === "change") {
      return { kind: "change" } satisfies Anchor;
    }
    const ref = spec.side === "head" ? params.headSha : params.baseSha;
    const blobSha = yield* resolveBlobShaAt(params.root, ref, spec.file);
    if (spec.kind === "file") {
      return {
        blobSha,
        file: spec.file,
        kind: "file",
        side: spec.side,
      } satisfies Anchor;
    }
    return {
      blobSha,
      file: spec.file,
      kind: "line",
      lines: spec.lines,
      side: spec.side,
    } satisfies Anchor;
  }
);
