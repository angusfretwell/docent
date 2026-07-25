/**
 * The Walkthrough write path over `.docent/`. Unlike Comments (append-only
 * record dirs), a walkthrough's `manifest.json` is assembled incrementally via
 * read-modify-write — safe because docent is single-user and local (sequential
 * CLI invocations, no concurrent writer to race).
 */

import type { CaptureKind } from "@shared/enums/capture-kind";
import { CaptureId, SectionId, WalkthroughId } from "@shared/schemas/ids";
import type { Callout, WalkthroughRange } from "@shared/schemas/walkthrough";
import {
  Capture,
  Walkthrough,
  WalkthroughSection,
} from "@shared/schemas/walkthrough";
import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { ensureReview } from "./review";
import { makeId } from "./store/id";
import { reviewDirPath } from "./store/layout";
import {
  updateManifest,
  assertSectionArms,
  loadWalkthrough,
  walkthroughDir,
  writeManifest,
} from "./store/manifest";
import { recordFile, serializeFrontmatter } from "./store/records";
import type { ChangeRefs } from "./write-context";
import { resolveWriteContext } from "./write-context";

export { SectionArmMismatch, WalkthroughNotFound } from "./store/manifest";

type WalkthroughKind = Walkthrough["kind"];

export class CaptureKindMismatch extends Schema.TaggedErrorClass<CaptureKindMismatch>()(
  "CaptureKindMismatch",
  { id: Schema.String }
) {
  override get message(): string {
    return `walkthrough ${this.id} is a code tour; captures belong to product tours`;
  }
}

interface WriteBase {
  root: string;
  branch: string;
  base: string;
}

/** Every write to an existing walkthrough seeds the Review shell first — the walkthrough is looked up inside it, so it has to exist. */
const loadForWrite = Effect.fn("loadForWrite")(function* loadForWrite(
  params: WriteBase & { walkthroughId: WalkthroughId }
) {
  const reviewDir = reviewDirPath(params.root, params.branch);
  yield* ensureReview({
    base: params.base,
    branch: params.branch,
    reviewDir,
    root: params.root,
  });
  return yield* loadWalkthrough(reviewDir, params.walkthroughId);
});

function contentSha(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

function slug(title: string): string {
  const slugged = title
    .toLowerCase()
    .replaceAll(NON_SLUG, "-")
    .replaceAll(EDGE_DASHES, "");
  return slugged === "" ? "section" : slugged;
}

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

    const { change, reviewDir } = yield* resolveWriteContext({
      base: params.base,
      branch: params.branch,
      refs: params.refs,
      root: params.root,
    });
    const id = yield* makeId(WalkthroughId, "wlk");

    const manifest = Walkthrough.make({
      bornChangeId: change.id,
      id,
      kind: params.kind,
      schema: "docent/walkthrough",
      sections: [],
      title: params.title,
    });
    const dir = walkthroughDir(path, reviewDir, params.kind, id);
    yield* fs.makeDirectory(dir, { recursive: true });
    yield* writeManifest(dir, manifest);

    return { changeId: change.id, walkthroughId: id };
  }
);

/** A title is editorial, so a shell minted by capture is born untitled; this is the only way to name one afterwards. */
export const renameWalkthrough = Effect.fn("renameWalkthrough")(
  function* renameWalkthrough(
    params: WriteBase & {
      walkthroughId: WalkthroughId;
      title: string;
    }
  ) {
    const loaded = yield* loadForWrite(params);

    yield* updateManifest(loaded, (current) =>
      Walkthrough.make({ ...current, title: params.title })
    );

    return { title: params.title, walkthroughId: params.walkthroughId };
  }
);

/**
 * The `sNN-` filename prefix is cosmetic — the manifest array is the
 * authoritative order. `ranges` is the code arm; `captureIds`/`callouts` the
 * product arm.
 */
export const addWalkthroughSection = Effect.fn("addWalkthroughSection")(
  function* addWalkthroughSection(
    params: WriteBase & {
      walkthroughId: WalkthroughId;
      title: string;
      body: string;
      ranges?: readonly WalkthroughRange[];
      captureIds?: readonly CaptureId[];
      callouts?: readonly Callout[];
    }
  ) {
    const fs = yield* FileSystem;
    const path = yield* Path;

    const loaded = yield* loadForWrite(params);
    const { dir, manifest } = loaded;

    const hasRanges = (params.ranges?.length ?? 0) > 0;
    const hasProduct =
      (params.captureIds?.length ?? 0) > 0 ||
      (params.callouts?.length ?? 0) > 0;
    const mismatch = assertSectionArms(
      manifest.kind,
      { hasProduct, hasRanges },
      params.walkthroughId
    );
    if (mismatch !== undefined) {
      return yield* Effect.fail(mismatch);
    }

    const id = yield* makeId(SectionId, "sec");
    const section = yield* Schema.decodeUnknownEffect(WalkthroughSection)({
      body: params.body,
      id,
      schema: "docent/walkthrough-section",
      title: params.title,
      ...(params.ranges === undefined ? {} : { ranges: params.ranges }),
      ...(params.captureIds === undefined
        ? {}
        : { captures: params.captureIds }),
      ...(params.callouts === undefined ? {} : { callouts: params.callouts }),
    });

    const filename = `s${String(manifest.sections.length + 1).padStart(2, "0")}-${slug(params.title)}.md`;
    const frontmatter = serializeFrontmatter([
      ["schema", section.schema],
      ["id", section.id],
      ["title", section.title],
      ["ranges", section.ranges],
      ["captures", section.captures],
      ["callouts", section.callouts],
    ]);
    yield* fs.writeFileString(
      path.join(dir, filename),
      recordFile(frontmatter, section.body)
    );

    yield* updateManifest(loaded, (current) =>
      Walkthrough.make({
        ...current,
        sections: [...current.sections, filename],
      })
    );

    return {
      section: filename,
      sectionId: id,
      walkthroughId: params.walkthroughId,
    };
  }
);

/**
 * Byte-identical media dedups to one content-addressed blob. Both kinds are
 * rrweb event streams: a recording is the whole stream, a screenshot the
 * `[Meta, FullSnapshot]` pair — a still frame is reconstructed DOM, not a
 * raster, so it stays sharp at any zoom.
 */
export const addWalkthroughCapture = Effect.fn("addWalkthroughCapture")(
  function* addWalkthroughCapture(
    params: WriteBase & {
      walkthroughId: WalkthroughId;
      kind: CaptureKind;
      media: Uint8Array;
      route: string;
      title?: string;
      viewport: readonly [number, number];
      dims?: readonly [number, number];
      durationMs?: number;
    }
  ) {
    const fs = yield* FileSystem;
    const path = yield* Path;

    const loaded = yield* loadForWrite(params);
    const { dir, manifest } = loaded;
    if (manifest.kind !== "product") {
      return yield* Effect.fail(
        new CaptureKindMismatch({ id: params.walkthroughId })
      );
    }

    const sha = contentSha(params.media);
    const captureDir = path.join(dir, "captures");
    yield* fs.makeDirectory(captureDir, { recursive: true });
    yield* fs.writeFile(
      path.join(captureDir, `${sha}.rrweb.json`),
      params.media
    );

    const id = yield* makeId(CaptureId, "cap");
    const entry = yield* Schema.decodeUnknownEffect(Capture)({
      id,
      kind: params.kind,
      media: sha,
      route: params.route,
      viewport: params.viewport,
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.dims === undefined ? {} : { dims: params.dims }),
      ...(params.durationMs === undefined
        ? {}
        : { durationMs: params.durationMs }),
    });

    yield* updateManifest(loaded, (current) =>
      Walkthrough.make({
        ...current,
        captures: [...(current.captures ?? []), entry],
      })
    );

    return {
      captureId: id,
      media: sha,
      registry: entry,
      walkthroughId: params.walkthroughId,
    };
  }
);
