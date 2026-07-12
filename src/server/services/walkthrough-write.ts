/**
 * The Walkthrough write path over `.docent/` — the CLI/server home for minting
 * walkthroughs, sections, and captures (agent-integration.md §3.3,
 * walkthroughs.md §3–6). The mirror of `review.ts`'s read path: every write
 * lands the exact plain files the walk parses back, in the shape an agent could
 * hand-author (walkthroughs.md §10; non-gating).
 *
 * It shares the finding write path's minting primitives verbatim — `mintChange`
 * for the lazy `bornChangeId`, `makeId` for the ULID ids, `ensureReview`, and
 * the `records.ts` frontmatter envelope — so there is one implementation of
 * ULID/Change/anchor minting and validation, never a second (issue #44).
 *
 * Unlike Findings (pure append-only record dirs), a walkthrough's `manifest.json`
 * is assembled incrementally: `create` writes the shell, then `add-section` /
 * `add-capture` read-modify-write the manifest to append. This is safe here —
 * docent is single-user and local, and these are sequential CLI invocations, so
 * there is no concurrent writer to race (the multi-writer rationale that makes
 * Findings append-only does not apply to one agent building one tour).
 */

import type {
  WalkthroughAnnotation,
  WalkthroughRange,
} from "@shared/schemas/walkthrough";
import {
  Capture,
  Walkthrough,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";
import { Effect, Option, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { makeId } from "../store/id";
import { readRecord } from "../store/io";
import { reviewDirPath } from "../store/layout";
import { recordFile, serializeFrontmatter } from "../store/records";
import type { ChangeRefs } from "./findings-write";
import { mintChange } from "./findings-write";
import { ensureReview } from "./review";

const KINDS = ["code", "product"] as const;
type WalkthroughKind = (typeof KINDS)[number];

/** A referenced walkthrough was not found under `walkthroughs/{code,product}/`. */
export class WalkthroughNotFound extends Schema.TaggedErrorClass<WalkthroughNotFound>()(
  "WalkthroughNotFound",
  { id: Schema.String }
) {
  override get message(): string {
    return `no walkthrough ${this.id} in this Review`;
  }
}

/** A capture write targeted a `code` walkthrough — captures are the product arm. */
export class CaptureKindMismatch extends Schema.TaggedErrorClass<CaptureKindMismatch>()(
  "CaptureKindMismatch",
  { id: Schema.String }
) {
  override get message(): string {
    return `walkthrough ${this.id} is a code tour; captures belong to product tours`;
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

/** The shared read scope every write resolves its Review against. */
interface WriteBase {
  root: string;
  branch: string;
  base: string;
}

/** The sha256 content address of a media blob — its `captures/<sha>.…` name. */
function contentSha(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

/** A filename-safe slug of a section title; empty titles fall back to `section`. */
function slug(title: string): string {
  const slugged = title
    .toLowerCase()
    .replaceAll(NON_SLUG, "-")
    .replaceAll(EDGE_DASHES, "");
  return slugged === "" ? "section" : slugged;
}

/** The walkthroughs root under a Review: `<reviewDir>/walkthroughs/`. */
function walkthroughsRoot(path: Path, reviewDir: string): string {
  return path.join(reviewDir, "walkthroughs");
}

/** Write a manifest canonically: 2-space JSON with a trailing newline. */
const writeManifest = Effect.fn("writeManifest")(function* writeManifest(
  dir: string,
  manifest: Walkthrough
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  yield* fs.writeFileString(
    path.join(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
});

/** A located walkthrough: its dir and decoded manifest (whose `kind` is authoritative). */
interface LoadedWalkthrough {
  dir: string;
  manifest: Walkthrough;
}

/**
 * Resolve a walkthrough by id, searching both pillars (there are only two). The
 * manifest's own `kind` is authoritative; a missing manifest is a not-found.
 */
const loadWalkthrough = Effect.fn("loadWalkthrough")(function* loadWalkthrough(
  reviewDir: string,
  id: string
) {
  const path = yield* Path;
  const root = walkthroughsRoot(path, reviewDir);
  for (const kind of KINDS) {
    const dir = path.join(root, kind, id);
    const manifest = yield* readRecord(
      path.join(dir, "manifest.json"),
      Walkthrough
    );
    if (Option.isSome(manifest)) {
      return { dir, manifest: manifest.value } satisfies LoadedWalkthrough;
    }
  }
  return yield* Effect.fail(new WalkthroughNotFound({ id }));
});

/**
 * Create a walkthrough shell: mint a `wlk_` id, mint-or-reuse the live head's
 * Change as `bornChangeId` (the shared lazy-mint), and write an empty-`sections`
 * `docent/walkthrough@2` manifest. Sections and captures append later.
 */
export const writeWalkthrough = Effect.fn("writeWalkthrough")(
  function* writeWalkthrough(
    params: WriteBase & {
      refs: ChangeRefs;
      kind: WalkthroughKind;
      title: string;
    }
  ) {
    const fs = yield* FileSystem;
    const path = yield* Path;

    const reviewDir = reviewDirPath(params.root, params.branch);
    yield* ensureReview({
      base: params.base,
      branch: params.branch,
      reviewDir,
      root: params.root,
    });
    const change = yield* mintChange({ refs: params.refs, reviewDir });
    const id = yield* makeId("wlk");

    const manifest = Walkthrough.make({
      bornChangeId: change.id,
      id,
      kind: params.kind,
      schema: "docent/walkthrough@2",
      sections: [],
      title: params.title,
    });
    const dir = path.join(walkthroughsRoot(path, reviewDir), params.kind, id);
    yield* fs.makeDirectory(dir, { recursive: true });
    yield* writeManifest(dir, manifest);

    return { changeId: change.id, walkthroughId: id };
  }
);

/**
 * Append a section to a walkthrough: mint a `sec_` id, validate the assembled
 * `docent/walkthrough-section@2` against the schema, write it as a numbered
 * `sNN-<slug>.md` file (the prefix is cosmetic — the manifest array is the
 * order), and append the filename to the manifest. `ranges` is the code arm;
 * `captureIds`/`annotations` the product arm.
 */
export const addWalkthroughSection = Effect.fn("addWalkthroughSection")(
  function* addWalkthroughSection(
    params: WriteBase & {
      walkthroughId: string;
      title: string;
      body: string;
      ranges?: readonly WalkthroughRange[];
      captureIds?: readonly string[];
      annotations?: readonly WalkthroughAnnotation[];
    }
  ) {
    const fs = yield* FileSystem;
    const path = yield* Path;

    const reviewDir = reviewDirPath(params.root, params.branch);
    yield* ensureReview({
      base: params.base,
      branch: params.branch,
      reviewDir,
      root: params.root,
    });
    const { dir, manifest } = yield* loadWalkthrough(
      reviewDir,
      params.walkthroughId
    );

    // A section carries the arm for its tour's kind (walkthroughs.md §5): ranges
    // for code, captures/annotations for product. Refuse the crossed arm.
    const hasRanges = (params.ranges?.length ?? 0) > 0;
    const hasProduct =
      (params.captureIds?.length ?? 0) > 0 ||
      (params.annotations?.length ?? 0) > 0;
    if (manifest.kind === "product" && hasRanges) {
      return yield* Effect.fail(
        new SectionArmMismatch({
          arm: "--range",
          id: params.walkthroughId,
          kind: manifest.kind,
        })
      );
    }
    if (manifest.kind === "code" && hasProduct) {
      return yield* Effect.fail(
        new SectionArmMismatch({
          arm: "--capture/--annotation",
          id: params.walkthroughId,
          kind: manifest.kind,
        })
      );
    }

    const id = yield* makeId("sec");
    const section = yield* Schema.decodeUnknownEffect(WalkthroughSection)({
      body: params.body,
      id,
      schema: "docent/walkthrough-section@2",
      title: params.title,
      ...(params.ranges === undefined ? {} : { ranges: params.ranges }),
      ...(params.captureIds === undefined
        ? {}
        : { captures: params.captureIds }),
      ...(params.annotations === undefined
        ? {}
        : { annotations: params.annotations }),
    });

    const filename = `s${String(manifest.sections.length + 1).padStart(2, "0")}-${slug(params.title)}.md`;
    const frontmatter = serializeFrontmatter([
      ["schema", section.schema],
      ["id", section.id],
      ["title", section.title],
      ["ranges", section.ranges],
      ["captures", section.captures],
      ["annotations", section.annotations],
    ]);
    yield* fs.writeFileString(
      path.join(dir, filename),
      recordFile(frontmatter, section.body)
    );

    const updated = Walkthrough.make({
      ...manifest,
      sections: [...manifest.sections, filename],
    });
    yield* writeManifest(dir, updated);

    return {
      section: filename,
      sectionId: id,
      walkthroughId: params.walkthroughId,
    };
  }
);

/**
 * Register a capture on a product walkthrough: content-address the media into
 * `captures/<sha>.png` (screenshot) or `captures/<sha>.rrweb.json` (recording) —
 * byte-identical media dedups to one blob — mint a `cap_` id, and append the
 * validated `captures[]` registry entry to the manifest (walkthroughs.md §6). A
 * code walkthrough has no capture arm, so it is refused.
 */
export const addWalkthroughCapture = Effect.fn("addWalkthroughCapture")(
  function* addWalkthroughCapture(
    params: WriteBase & {
      walkthroughId: string;
      kind: "screenshot" | "recording";
      media: Uint8Array;
      route: string;
      viewport: readonly [number, number];
      dims?: readonly [number, number];
      durationMs?: number;
    }
  ) {
    const fs = yield* FileSystem;
    const path = yield* Path;

    const reviewDir = reviewDirPath(params.root, params.branch);
    yield* ensureReview({
      base: params.base,
      branch: params.branch,
      reviewDir,
      root: params.root,
    });
    const { dir, manifest } = yield* loadWalkthrough(
      reviewDir,
      params.walkthroughId
    );
    if (manifest.kind !== "product") {
      return yield* Effect.fail(
        new CaptureKindMismatch({ id: params.walkthroughId })
      );
    }

    const sha = contentSha(params.media);
    const extension = params.kind === "screenshot" ? "png" : "rrweb.json";
    const captureDir = path.join(dir, "captures");
    yield* fs.makeDirectory(captureDir, { recursive: true });
    yield* fs.writeFile(
      path.join(captureDir, `${sha}.${extension}`),
      params.media
    );

    const id = yield* makeId("cap");
    const entry = yield* Schema.decodeUnknownEffect(Capture)({
      id,
      kind: params.kind,
      media: sha,
      route: params.route,
      viewport: params.viewport,
      ...(params.dims === undefined ? {} : { dims: params.dims }),
      ...(params.durationMs === undefined
        ? {}
        : { durationMs: params.durationMs }),
    });

    const updated = Walkthrough.make({
      ...manifest,
      captures: [...(manifest.captures ?? []), entry],
    });
    yield* writeManifest(dir, updated);

    return {
      captureId: id,
      media: sha,
      registry: entry,
      walkthroughId: params.walkthroughId,
    };
  }
);
