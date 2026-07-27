/**
 * rrweb carries a stylesheet's *text* but never the bytes that text points at,
 * so a capture's fonts, background images and unreadable cross-origin sheets
 * stay as URLs into the app's own origin. The Review replays them from docent's
 * origin, where a font request is always a CORS request the app does not answer
 * — and once the dev server stops, nothing answers at all. Fetching each asset
 * at registration and rewriting it to a `data:` URI is what makes a capture an
 * artifact rather than a pointer at somebody's dev server.
 *
 * rrweb's own options reach only what the page built in JavaScript:
 * `collectFonts` sees fonts constructed through `FontFace`, never `@font-face`
 * rules, and `inlineImages` reaches `<img>` bitmaps through a canvas. Everything
 * else is this module's.
 */

import { Effect, Option } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

import { parseJson } from "./store/parse";

export interface AssetSkip {
  reason: string;
  url: string;
}

export interface AssetInlineReport {
  /** Asset bytes now riding in the stream, before base64's ~4/3 expansion. */
  bytes: number;
  inlined: number;
  skipped: readonly AssetSkip[];
}

const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_STREAM_BYTES = 32 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/** How far a stylesheet may pull in another stylesheet (`@import`) before we stop. */
const MAX_CSS_DEPTH = 3;

const URL_ATTRIBUTES = new Set(["poster", "src", "xlink:href"]);

/** A script never runs in the sandboxed replay frame, and rrweb strips iframe `src` itself. */
const OPAQUE_TAGS = new Set(["iframe", "script"]);

const PRELOAD_RELS = new Set(["modulepreload", "prefetch", "preload"]);

const CSS_URL =
  /url\((?:'(?<single>[^']*)'|"(?<double>[^"]*)"|(?<bare>[^)]*))\)/g;
const SRCSET_SEPARATOR = /\s*,\s*/;
const DESCRIPTOR_SEPARATOR = /\s+/;
const CSS_TYPE = "text/css";

const EXTENSION_TYPES: Record<string, string> = {
  avif: "image/avif",
  css: CSS_TYPE,
  eot: "application/vnd.ms-fontobject",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  otf: "font/otf",
  png: "image/png",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  webm: "video/webm",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
};

const LOCAL_SUFFIXES = [".localhost", ".test", ".local", ".internal"];
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

interface Asset {
  bytes: Uint8Array;
  type: string;
}

interface ReadFailure {
  reason: string;
}

interface Budget {
  bytes: number;
  readonly cache: Map<string, Asset | undefined>;
  /** Set by every rewrite, including the ones that only take a request away. */
  changed: boolean;
  readonly fetch: typeof globalThis.fetch;
  inlined: number;
  readonly skipped: AssetSkip[];
}

function thrownMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function skip(budget: Budget, url: string, reason: string) {
  budget.skipped.push({ reason, url });
}

/** Absolute http(s) only: `data:`, `blob:` and `about:` are already inline or unreachable from here. */
function resolve(raw: string, base: string): URL | undefined {
  if (raw === "") {
    return undefined;
  }

  try {
    const url = new URL(raw, base);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

function isLocal(hostname: string): boolean {
  return (
    LOOPBACK_HOSTS.has(hostname) ||
    LOCAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

/**
 * A dev server on a local hostname is usually fronted by a certificate issued by
 * a root only the human's browser trusts, and refusing it would leave behind
 * exactly the assets we came for. Anything reachable off the machine is verified
 * as normal.
 */
function requestInit(url: URL, signal: AbortSignal): BunFetchRequestInit {
  return isLocal(url.hostname)
    ? { signal, tls: { rejectUnauthorized: false } }
    : { signal };
}

function mediaType(url: URL, header: string | null): string {
  const declared = header?.split(";")[0]?.trim() ?? "";
  if (declared !== "") {
    return declared;
  }

  const dot = url.pathname.lastIndexOf(".");
  const extension = dot === -1 ? "" : url.pathname.slice(dot + 1).toLowerCase();

  return EXTENSION_TYPES[extension] ?? "application/octet-stream";
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function dataUri(type: string, bytes: Uint8Array): string {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

const readAsset = Effect.fn("readAsset")(function* readAsset(
  budget: Budget,
  url: URL
) {
  return yield* Effect.tryPromise({
    catch: thrownMessage,
    try: async (signal): Promise<Asset> => {
      const response = await budget.fetch(url, requestInit(url, signal));
      if (!response.ok) {
        throw new Error(`responded ${response.status}`);
      }

      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        type: mediaType(url, response.headers.get("content-type")),
      };
    },
  }).pipe(
    Effect.timeout(FETCH_TIMEOUT_MS),
    Effect.catch(
      (error): Effect.Effect<Asset | ReadFailure> =>
        Effect.succeed({
          reason: typeof error === "string" ? error : "timed out",
        })
    )
  );
});

const takeAsset = Effect.fn("takeAsset")(function* takingAsset(
  budget: Budget,
  url: URL
) {
  if (budget.bytes >= MAX_STREAM_BYTES) {
    skip(budget, url.href, "the stream's asset budget is spent");
    return;
  }

  const read = yield* readAsset(budget, url);

  if ("reason" in read) {
    skip(budget, url.href, read.reason);
    return;
  }

  if (read.bytes.length > MAX_ASSET_BYTES) {
    skip(
      budget,
      url.href,
      `${read.bytes.length} bytes is over the per-asset cap`
    );
    return;
  }

  budget.bytes += read.bytes.length;
  budget.inlined += 1;

  return read;
});

const cachedAsset = Effect.fn("cachedAsset")(function* cachedAsset(
  budget: Budget,
  url: URL
) {
  const cached = budget.cache.get(url.href);
  if (cached !== undefined || budget.cache.has(url.href)) {
    return cached;
  }

  const asset = yield* takeAsset(budget, url);
  budget.cache.set(url.href, asset);

  return asset;
});

/** Whatever a reference resolves to, alongside the URL its own references resolve against. */
const takeAssetAt = Effect.fn("takeAssetAt")(function* takeAssetAt(
  budget: Budget,
  raw: string,
  base: string
) {
  const url = resolve(raw, base);

  if (url === undefined) {
    return;
  }

  const asset = yield* cachedAsset(budget, url);

  return asset === undefined ? undefined : { asset, url };
});

/**
 * Recursive because CSS is: a sheet points at fonts and images, and one of those
 * references can be another sheet (`@import`), whose own references resolve
 * against it rather than against the document that pulled it in.
 */
const inlineCss: (
  budget: Budget,
  cssText: string,
  base: string,
  depth: number
) => Effect.Effect<string> = Effect.fn("inlineCss")(function* inliningCss(
  budget: Budget,
  cssText: string,
  base: string,
  depth: number
) {
  let result = cssText;

  for (const match of cssText.matchAll(CSS_URL)) {
    const groups = match.groups ?? {};
    const raw = (groups.single ?? groups.double ?? groups.bare ?? "").trim();
    const found = yield* takeAssetAt(budget, raw, base);

    if (found === undefined) {
      continue;
    }

    const { asset, url } = found;
    const nested = asset.type === CSS_TYPE && depth < MAX_CSS_DEPTH;
    const uri = nested
      ? dataUri(
          CSS_TYPE,
          new TextEncoder().encode(
            yield* inlineCss(
              budget,
              decodeText(asset.bytes),
              url.href,
              depth + 1
            )
          )
        )
      : dataUri(asset.type, asset.bytes);

    /* A replacer function, not a string: a `data:` URI can carry `$&`, which
       `replace` would otherwise read as a capture reference. */
    result = result.replace(match[0], () => `url("${uri}")`);
  }

  return result;
});

const assetUri = Effect.fn("assetUri")(function* assetUri(
  budget: Budget,
  raw: string,
  base: string
) {
  const found = yield* takeAssetAt(budget, raw, base);

  return found === undefined
    ? undefined
    : dataUri(found.asset.type, found.asset.bytes);
});

const inlineSrcset = Effect.fn("inlineSrcset")(function* inlineSrcset(
  budget: Budget,
  value: string,
  base: string
) {
  const rewritten: string[] = [];

  for (const candidate of value.split(SRCSET_SEPARATOR)) {
    const [raw, ...descriptors] = candidate.trim().split(DESCRIPTOR_SEPARATOR);

    if (raw === undefined || raw === "") {
      continue;
    }

    const uri = yield* assetUri(budget, raw, base);
    rewritten.push([uri ?? raw, ...descriptors].join(" "));
  }

  return rewritten.join(", ");
});

const rewriteLink = Effect.fn("rewriteLink")(function* rewriteLink(
  budget: Budget,
  attributes: Record<string, unknown>,
  base: string
) {
  const { href } = attributes;

  if (typeof href !== "string") {
    return;
  }

  const rel =
    typeof attributes.rel === "string" ? attributes.rel.toLowerCase() : "";

  /* rrweb leaves `href` on a sheet only when it could not read one, and the
     replayer rebuilds a link carrying `_cssText` as a `<style>` — so filling
     that in is how an unreadable cross-origin sheet replays at all. */
  if (rel.includes("stylesheet")) {
    const found = yield* takeAssetAt(budget, href, base);

    if (found !== undefined) {
      attributes._cssText = yield* inlineCss(
        budget,
        decodeText(found.asset.bytes),
        found.url.href,
        1
      );
      attributes.rel = undefined;
      attributes.href = undefined;
      budget.changed = true;
    }

    return;
  }

  /* A preload of bytes that now ride inline is a second request for something
     already in the stream, and a font preload is a CORS request — the very
     failure this module exists to remove. */
  if (PRELOAD_RELS.has(rel)) {
    attributes.href = undefined;
    budget.changed = true;
    return;
  }

  if (rel.includes("icon")) {
    const uri = yield* assetUri(budget, href, base);

    if (uri !== undefined) {
      attributes.href = uri;
      budget.changed = true;
    }
  }
});

const rewriteAttributes = Effect.fn("rewriteAttributes")(
  function* rewriteAttributes(
    budget: Budget,
    attributes: Record<string, unknown>,
    tagName: string | undefined,
    base: string
  ) {
    if (tagName !== undefined && OPAQUE_TAGS.has(tagName)) {
      return;
    }

    if (tagName === "link") {
      yield* rewriteLink(budget, attributes, base);
    }

    for (const [name, value] of Object.entries(attributes)) {
      if (typeof value !== "string") {
        continue;
      }

      if (name === "srcset") {
        const rewritten = yield* inlineSrcset(budget, value, base);
        if (rewritten !== value) {
          attributes[name] = rewritten;
          budget.changed = true;
        }
        continue;
      }

      if (!URL_ATTRIBUTES.has(name)) {
        continue;
      }

      const uri = yield* assetUri(budget, value, base);

      if (uri !== undefined) {
        attributes[name] = uri;
        budget.changed = true;
      }
    }
  }
);

/**
 * Structural, not typed against rrweb's node and mutation shapes: the same
 * attribute bag and the same CSS text appear in a full snapshot, in an added
 * node, in an attribute mutation and in a stylesheet rule, and a walk that
 * matches on shape covers all of them — including whatever the next rrweb
 * version adds.
 */
const rewriteTree: (
  budget: Budget,
  value: unknown,
  base: string
) => Effect.Effect<void> = Effect.fn("rewriteTree")(function* walk(
  budget: Budget,
  value: unknown,
  base: string
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      yield* rewriteTree(budget, item, base);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (isRecord(value.attributes)) {
    const tagName =
      typeof value.tagName === "string"
        ? value.tagName.toLowerCase()
        : undefined;
    yield* rewriteAttributes(budget, value.attributes, tagName, base);
  }

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      if (child.includes("url(")) {
        const rewritten = yield* inlineCss(budget, child, base, 0);
        if (rewritten !== child) {
          value[key] = rewritten;
          budget.changed = true;
        }
      }
      continue;
    }

    yield* rewriteTree(budget, child, base);
  }
});

/** rrweb's `Meta` event holds the page the stream was taken on — the base for anything left relative. */
function documentBase(events: unknown): string {
  if (!Array.isArray(events)) {
    return "http://localhost/";
  }

  for (const event of events) {
    if (isRecord(event) && isRecord(event.data)) {
      const { href } = event.data;
      if (typeof href === "string" && href !== "") {
        return href;
      }
    }
  }

  return "http://localhost/";
}

/**
 * Returns the media untouched when there was nothing to inline, so a stream that
 * carries no remote assets keeps hashing to the blob it already content-addressed
 * to.
 */
export const inlineCaptureAssets = Effect.fn("inlineCaptureAssets")(
  function* inlineCaptureAssets(media: Uint8Array) {
    const parsed = yield* parseJson(new TextDecoder().decode(media)).pipe(
      Effect.option
    );

    if (Option.isNone(parsed)) {
      return { media, report: { bytes: 0, inlined: 0, skipped: [] } };
    }

    const budget: Budget = {
      bytes: 0,
      cache: new Map(),
      changed: false,
      fetch: yield* FetchHttpClient.Fetch,
      inlined: 0,
      skipped: [],
    };
    const events = parsed.value;

    yield* rewriteTree(budget, events, documentBase(events));

    const report: AssetInlineReport = {
      bytes: budget.bytes,
      inlined: budget.inlined,
      skipped: budget.skipped,
    };

    if (!budget.changed) {
      return { media, report };
    }

    return {
      media: new TextEncoder().encode(JSON.stringify(events)),
      report,
    };
  }
);
