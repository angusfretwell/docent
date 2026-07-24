import type { Side } from "@shared/enums/side";
import type { Anchor } from "@shared/schemas/finding";
import { Effect } from "effect";

import { resolveBlobShaAt } from "./resolve";

export type AnchorSpec =
  | { kind: "change" }
  | { file: string; kind: "file"; side: Side }
  | { file: string; kind: "line"; lines: [number, number]; side: Side }
  | { anchor: Anchor; kind: "raw" };

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
