/**
 * The walkthrough `manifest.json` read-modify-write over `.docent/`
 * (walkthroughs.md §4–6): locate a walkthrough by id across both pillars,
 * write a manifest canonically, and apply the shared load-mutate-persist shape
 * `addWalkthroughSection`/`addWalkthroughCapture` in `walkthrough-write.ts`
 * both run to append one entry to `sections`/`captures`.
 *
 * Unlike Findings (pure append-only record dirs), a manifest is assembled
 * incrementally, so this is a plain read-modify-write. That is safe here —
 * docent is single-user and local, and these are sequential CLI invocations,
 * so there is no concurrent writer to race (the multi-writer rationale that
 * makes Findings append-only does not apply to one agent building one tour).
 */

import { walkthroughKinds } from "@shared/enums/walkthrough-kind";
import type { WalkthroughId } from "@shared/schemas/ids";
import { Walkthrough } from "@shared/schemas/walkthrough";
import { Effect, Option, Schema } from "effect";
import { Path } from "effect/Path";

import { readRecord, writeJsonRecord } from "./io";

/** A referenced walkthrough was not found under `walkthroughs/{code,product}/`. */
export class WalkthroughNotFound extends Schema.TaggedErrorClass<WalkthroughNotFound>()(
  "WalkthroughNotFound",
  { id: Schema.String }
) {
  override get message(): string {
    return `no walkthrough ${this.id} in this Review`;
  }
}

/**
 * A section carried the wrong arm for its walkthrough's `kind` (walkthroughs.md
 * §5): `ranges` on a product tour, or `captures`/`annotations` on a code tour.
 */
export class SectionArmMismatch extends Schema.TaggedErrorClass<SectionArmMismatch>()(
  "SectionArmMismatch",
  { arm: Schema.String, id: Schema.String, kind: Schema.String }
) {
  override get message(): string {
    return `walkthrough ${this.id} is a ${this.kind} tour; ${this.arm} is the ${this.kind === "code" ? "product" : "code"} arm`;
  }
}

/** Which arms a section's write params carried, independent of any schema shape. */
export interface SectionArms {
  hasRanges: boolean;
  hasProduct: boolean;
}

/**
 * The arm mismatch for a section against its walkthrough's `kind`
 * (walkthroughs.md §5): `ranges` is the code arm; `captures`/`annotations` the
 * product arm. `undefined` when the arms match the kind. Pure — the caller
 * (an Effect generator) fails with the returned error itself.
 */
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
      arm: "--capture/--annotation",
      id,
      kind,
    });
  }
  return undefined;
}

/** The directory for one walkthrough: `<reviewDir>/walkthroughs/<kind>/<id>`. */
export function walkthroughDir(
  path: Path,
  reviewDir: string,
  kind: Walkthrough["kind"],
  id: WalkthroughId
): string {
  return path.join(reviewDir, "walkthroughs", kind, id);
}

/** A located walkthrough: its dir and decoded manifest (whose `kind` is authoritative). */
export interface LoadedWalkthrough {
  dir: string;
  manifest: Walkthrough;
}

/**
 * Resolve a walkthrough by id, searching both pillars (there are only two). The
 * manifest's own `kind` is authoritative; a missing manifest is a not-found.
 */
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

/** Write a manifest canonically: 2-space JSON with a trailing newline. */
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

/**
 * Apply a pure mutation to a located manifest and persist it — the shared
 * load-mutate-persist shape `addWalkthroughSection`/`addWalkthroughCapture`
 * both run to append one entry to `sections`/`captures` (walkthroughs.md §4,
 * §6). Returns the persisted manifest.
 */
export const appendToManifest = Effect.fn("appendToManifest")(
  function* appendToManifest(
    loaded: LoadedWalkthrough,
    mutate: (manifest: Walkthrough) => Walkthrough
  ) {
    const updated = mutate(loaded.manifest);
    yield* writeManifest(loaded.dir, updated);
    return updated;
  }
);
