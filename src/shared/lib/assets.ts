/**
 * The built browser UI as an in-memory asset map, keyed by request path.
 *
 * The server (`docent serve`) serves these bytes directly — there is no
 * on-disk `root` to walk, so the same code path works whether the assets sit
 * in `dist/client/` (dev) or are embedded in the compiled binary
 * (docs/spec/architecture.md §5). Each `filePath` is what `Bun.file` reads:
 * a real path in dev, a Bun-embedded path in the `--compile` binary.
 */

/** One built asset: the file its bytes come from, and how to serve it. */
export interface Asset {
  /** Path `Bun.file` reads — on disk in dev, embedded in the compiled binary. */
  readonly filePath: string;
  /** `Content-Type` header value for this asset. */
  readonly contentType: string;
}

/** Built client assets, keyed by absolute request path (e.g. `/assets/x.js`). */
export type ClientAssets = ReadonlyMap<string, Asset>;

/** One generated-manifest row: request path → the file to embed/serve. */
export interface ManifestEntry {
  /** Absolute request path, e.g. `/index.html` or `/assets/index-abc.js`. */
  readonly path: string;
  /** `Bun.file` path for the bytes (embedded via `with { type: "file" }`). */
  readonly file: string;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const EXTENSION = /\.[^./]+$/;

/** The `Content-Type` for a path by extension; octet-stream when unknown. */
export function contentTypeFor(path: string): string {
  const ext = EXTENSION.exec(path)?.[0]?.toLowerCase();
  return (ext && CONTENT_TYPES[ext]) || "application/octet-stream";
}

/** Build the served asset map from a generated manifest. */
export function assetsFromManifest(entries: readonly ManifestEntry[]): ClientAssets {
  const map = new Map<string, Asset>();
  for (const entry of entries) {
    map.set(entry.path, {
      contentType: contentTypeFor(entry.path),
      filePath: entry.file,
    });
  }
  return map;
}

/**
 * Resolve a request pathname to its asset, mapping `/` to `/index.html`.
 * Returns undefined for anything not in the map — the natural 404, and the
 * reason path traversal can't escape (only mapped keys are ever served).
 */
export function lookupAsset(assets: ClientAssets, pathname: string): Asset | undefined {
  return assets.get(pathname === "/" ? "/index.html" : pathname);
}
