/**
 * Unlike Comments (append-only), a manifest is assembled incrementally via
 * read-modify-write. Safe because docent is single-user and local — sequential
 * CLI invocations, no concurrent writer to race.
 */

import { walkthroughKinds } from "@shared/enums/walkthrough-kind";
import type { WalkthroughId } from "@shared/schemas/ids";
import { Walkthrough } from "@shared/schemas/walkthrough";
import { Effect, Option, Schema } from "effect";
import { Path } from "effect/Path";

import { readRecord, writeJsonRecord } from "./io";

export class WalkthroughNotFound extends Schema.TaggedErrorClass<WalkthroughNotFound>()(
  "WalkthroughNotFound",
  { id: Schema.String }
) {
  override get message(): string {
    return `no walkthrough ${this.id} in this Review`;
  }
}

export class SectionArmMismatch extends Schema.TaggedErrorClass<SectionArmMismatch>()(
  "SectionArmMismatch",
  { arm: Schema.String, id: Schema.String, kind: Schema.String }
) {
  override get message(): string {
    return `walkthrough ${this.id} is a ${this.kind} tour; ${this.arm} is the ${this.kind === "code" ? "product" : "code"} arm`;
  }
}

export interface SectionArms {
  hasRanges: boolean;
  hasProduct: boolean;
}

/** `ranges` is the code arm; `captures`/`callouts` the product arm. `undefined` when the arms match the kind. */
export function assertSectionArms(
  kind: Walkthrough["kind"],
  arms: SectionArms,
  id: string
): SectionArmMismatch | undefined {
  if (kind === "product" && arms.hasRanges) {
    return new SectionArmMismatch({ arm: "--range", id, kind });
  }
  if (kind === "code" && arms.hasProduct) {
    return new SectionArmMismatch({
      arm: "--capture/--callout",
      id,
      kind,
    });
  }
  return undefined;
}

export function walkthroughDir(
  path: Path,
  reviewDir: string,
  kind: Walkthrough["kind"],
  id: WalkthroughId
): string {
  return path.join(reviewDir, "walkthroughs", kind, id);
}

export interface LoadedWalkthrough {
  dir: string;
  manifest: Walkthrough;
}

/** The manifest's own `kind` is authoritative; a missing manifest is a not-found. */
export const loadWalkthrough = Effect.fn("loadWalkthrough")(
  function* loadWalkthrough(reviewDir: string, id: WalkthroughId) {
    const path = yield* Path;
    for (const kind of walkthroughKinds) {
      const dir = walkthroughDir(path, reviewDir, kind, id);
      const manifest = yield* readRecord(
        path.join(dir, "manifest.json"),
        Walkthrough
      );
      if (Option.isSome(manifest)) {
        return { dir, manifest: manifest.value } satisfies LoadedWalkthrough;
      }
    }
    return yield* Effect.fail(new WalkthroughNotFound({ id }));
  }
);

export const writeManifest = Effect.fn("writeManifest")(function* writeManifest(
  dir: string,
  manifest: Walkthrough
) {
  const path = yield* Path;
  yield* writeJsonRecord(
    path.join(dir, "manifest.json"),
    Walkthrough,
    manifest
  );
});

export const updateManifest = Effect.fn("updateManifest")(
  function* updateManifest(
    loaded: LoadedWalkthrough,
    mutate: (manifest: Walkthrough) => Walkthrough
  ) {
    const updated = mutate(loaded.manifest);
    yield* writeManifest(loaded.dir, updated);
    return updated;
  }
);
