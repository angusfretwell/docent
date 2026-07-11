/**
 * The `docent serve` app shell: a Bun-native local server that serves the built
 * browser UI, the live branch diff (`GET /api/diff`), raw git blobs for context
 * expansion (`GET /api/blob/:sha`), the active Dossier snapshot
 * (`GET /api/dossier`), and the SSE live-reload stream (`GET /api/events`) fed
 * by a `.docent/` watch. Exposed as an Effect `Layer`; runtime boundaries
 * (bin.ts, tests) build it and keep it alive for the server's lifetime.
 *
 * The UI is served from an in-memory `ClientAssets` map, not an on-disk root,
 * so the identical code path serves the `dist/client/` build in dev and the
 * assets embedded into the compiled binary (docs/spec/architecture.md §5).
 */

import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer, Stream } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { lookupAsset } from "@shared/lib/assets";
import type { ClientAssets } from "@shared/lib/assets";
import { ViewedRequest } from "@shared/schemas/dossier";
import { FindingWrite } from "@shared/schemas/finding-write";
import type { PendingRange } from "@shared/schemas/pending";
import { appendViewedEvent, dossierDirPath, readDossierSnapshot } from "../services/dossier";
import { writeFindingRecord } from "../services/findings-write";
import {
  resolveAuthor,
  resolveBlob,
  resolveBlobSize,
  resolveChange,
  resolveChangeRefs,
  resolvePending,
  resolveRepo,
  resolveWorktreeFile,
} from "../services/git";
import { DocentWatch, layer as watchLayer } from "./watch";

export interface ServeOptions {
  /** Built browser UI, keyed by request path (dev disk or embedded binary). */
  assets: ClientAssets;
  /** Directory to resolve the git repo from (any path inside the repo). */
  cwd: string;
}

/** The running server's base URL (with trailing slash), e.g. for printing. */
export const serverUrl: Effect.Effect<string, never, HttpServer.HttpServer> = Effect.map(
  Effect.service(HttpServer.HttpServer),
  (server) => new URL(HttpServer.formatAddress(server.address)).href,
);

function diffRoute(cwd: string) {
  return HttpRouter.add(
    "GET",
    "/api/diff",
    resolveChange(cwd).pipe(
      Effect.flatMap((change) => HttpServerResponse.json(change)),
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 500 })),
      ),
    ),
  );
}

// Base for parsing a request's relative URL; only the path/query is read from it.
const REQUEST_URL_BASE = "http://localhost";

// A git object id is immutable, so its bytes never change: cache for a year and
// mark immutable so the browser never revalidates a blob it already has.
const BLOB_CACHE_CONTROL = "public, max-age=31536000, immutable";

// The opaque byte-stream content-type for raw blobs and worktree files.
const OCTET_STREAM = "application/octet-stream";

/**
 * `GET /api/blob/:sha` — the raw bytes of a git blob, resolved via pure local
 * `git cat-file` (no network). Content-addressed, so responses cache forever.
 * The Diff tab fetches these lazily to feed the renderer full file blobs for
 * context expansion — both the base and head sides go through here
 * (diff-review.md §4, architecture.md §2). A malformed id 400s; an id absent
 * from the repo 404s.
 */
function blobRoute(cwd: string) {
  return HttpRouter.add(
    "GET",
    "/api/blob/:sha",
    Effect.gen(function* serveBlob() {
      const params = yield* HttpRouter.params;
      const bytes = yield* resolveBlob(cwd, params.sha ?? "");
      return HttpServerResponse.uint8Array(bytes, {
        contentType: OCTET_STREAM,
        headers: { "cache-control": BLOB_CACHE_CONTROL },
      });
    }).pipe(
      Effect.catchTag("InvalidObjectId", (error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 400 })),
      ),
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 404 })),
      ),
    ),
  );
}

/**
 * `GET /api/blob/:sha/size` — the byte size of a git blob, read from its object
 * header via `git cat-file -s` (never streaming the bytes). The Diff tab shows
 * this as the size-delta row on binary files (diff-review.md §5). Content-
 * addressed, so cached forever like the blob itself. A malformed id 400s; an
 * absent id 404s.
 */
function blobSizeRoute(cwd: string) {
  return HttpRouter.add(
    "GET",
    "/api/blob/:sha/size",
    Effect.gen(function* serveBlobSize() {
      const params = yield* HttpRouter.params;
      const size = yield* resolveBlobSize(cwd, params.sha ?? "");
      return yield* HttpServerResponse.json(
        { size },
        { headers: { "cache-control": BLOB_CACHE_CONTROL } },
      );
    }).pipe(
      Effect.catchTag("InvalidObjectId", (error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 400 })),
      ),
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 404 })),
      ),
    ),
  );
}

// A walkthrough id and a capture filename must be plain, single-segment names —
// no slashes, no `..` — so the join below can never escape the captures dir.
const WALKTHROUGH_ID = /^wlk_[A-Za-z0-9]+$/;
const CAPTURE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The content-type for a capture media file, keyed off its extension. */
function captureContentType(file: string): string {
  if (file.endsWith(".png")) {
    return "image/png";
  }
  if (file.endsWith(".json")) {
    return "application/json";
  }
  return OCTET_STREAM;
}

/**
 * `GET /api/capture/:walkthrough/:file` — the raw bytes of a product-walkthrough
 * capture blob, read off `.docent/dossiers/<slug>/walkthroughs/product/<wlk>/
 * captures/<file>` (walkthroughs.md §3, §6). Unlike code ranges, capture media
 * is **not a git blob** — it lives in the gitignored Dossier, born with its
 * immutable walkthrough — so `git cat-file` (`/api/blob/:sha`) cannot serve it.
 * The `<file>` is `<media-sha>.png` (screenshots, served `image/png` for a bare
 * `<img src>`) or `<media-sha>.rrweb.json` (recordings, served `application/json`
 * for the rrweb replayer). Content-addressed, so responses cache forever. A
 * malformed id/filename 400s; an absent file 404s.
 */
function captureRoute(cwd: string) {
  return HttpRouter.add(
    "GET",
    "/api/capture/:walkthrough/:file",
    Effect.gen(function* serveCapture() {
      const params = yield* HttpRouter.params;
      const walkthrough = params.walkthrough ?? "";
      const file = params.file ?? "";
      if (!(WALKTHROUGH_ID.test(walkthrough) && CAPTURE_FILE.test(file)) || file.includes("..")) {
        return HttpServerResponse.jsonUnsafe({ error: "invalid capture path" }, { status: 400 });
      }
      const repo = yield* resolveRepo(cwd);
      const fs = yield* FileSystem;
      const path = yield* Path;
      const filePath = path.join(
        dossierDirPath(repo.root, repo.branch),
        "walkthroughs",
        "product",
        walkthrough,
        "captures",
        file,
      );
      const bytes = yield* fs.readFile(filePath);
      return HttpServerResponse.uint8Array(bytes, {
        contentType: captureContentType(file),
        headers: { "cache-control": BLOB_CACHE_CONTROL },
      });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 404 })),
      ),
    ),
  );
}

// The working tree is mutable with no stable SHA to cache against, so its live
// bytes must never be cached (diff-review.md §6, architecture.md §2).
const WORKTREE_CACHE_CONTROL = "no-store";

/**
 * `GET /api/pending?range=incremental|cumulative` — the read-only preview of
 * the dirty working tree that backs the Diff tab's Pending entry
 * (diff-review.md §6). Resolved live from git per request (uncached; the client
 * re-fetches on every SSE change). An unknown/absent `range` defaults to the
 * primary `incremental` view. A git failure 500s with the message.
 */
function pendingRoute(cwd: string) {
  return HttpRouter.add("GET", "/api/pending", (request) =>
    Effect.gen(function* servePending() {
      const { searchParams } = new URL(request.url, REQUEST_URL_BASE);
      const range: PendingRange =
        searchParams.get("range") === "cumulative" ? "cumulative" : "incremental";
      const pending = yield* resolvePending(cwd, range);
      return yield* HttpServerResponse.json(pending);
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 500 })),
      ),
    ),
  );
}

/**
 * `GET /api/worktree?path=…` — the live bytes of a working-tree file, read off
 * disk on every request and explicitly uncached. This is the Pending diff's
 * head side, which has no committed SHA to address (diff-review.md §6). A path
 * that escapes the repo root 400s; a path that does not exist 404s.
 */
function worktreeRoute(cwd: string) {
  return HttpRouter.add("GET", "/api/worktree", (request) =>
    Effect.gen(function* serveWorktree() {
      const { searchParams } = new URL(request.url, REQUEST_URL_BASE);
      const bytes = yield* resolveWorktreeFile(cwd, searchParams.get("path") ?? "");
      return HttpServerResponse.uint8Array(bytes, {
        contentType: OCTET_STREAM,
        headers: { "cache-control": WORKTREE_CACHE_CONTROL },
      });
    }).pipe(
      Effect.catchTag("InvalidWorktreePath", (error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 400 })),
      ),
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 404 })),
      ),
    ),
  );
}

/**
 * Serve the built UI from the in-memory asset map. A `*` wildcard falls in
 * behind the explicit `/api/*` routes, so it only sees UI requests. Unmapped
 * paths 404 — which also closes off path traversal, since only keys that were
 * put in the map can ever be served.
 */
function assetRoute(assets: ClientAssets) {
  return HttpRouter.add("GET", "*", (request) =>
    Effect.gen(function* serveAsset() {
      const { pathname } = new URL(request.url, REQUEST_URL_BASE);
      const asset = lookupAsset(assets, pathname);
      if (asset === undefined) {
        return HttpServerResponse.empty({ status: 404 });
      }
      const bytes = yield* Effect.promise(() => Bun.file(asset.filePath).bytes());
      return HttpServerResponse.uint8Array(bytes, {
        contentType: asset.contentType,
      });
    }),
  );
}

/**
 * `GET /api/dossier` — the JSON snapshot of the active Dossier (the one for the
 * checked-out branch), walked live off `.docent/` on every request (uncached).
 * The Dossier auto-creates on first use; the branch/base come from git.
 */
function dossierRoute(cwd: string) {
  return HttpRouter.add(
    "GET",
    "/api/dossier",
    resolveRepo(cwd).pipe(
      Effect.flatMap((repo) =>
        readDossierSnapshot({
          base: repo.defaultBranch.name,
          branch: repo.branch,
          root: repo.root,
        }),
      ),
      Effect.flatMap((snapshot) => HttpServerResponse.json(snapshot)),
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 500 })),
      ),
    ),
  );
}

/**
 * `POST /api/viewed` — append one mark-as-viewed toggle to the active Dossier's
 * `viewed/` log (diff-review.md §3). The body is `{ path, blobSha }`; the server
 * stamps the timestamp and writes the event, then the `.docent/` watch re-pushes
 * the snapshot over SSE so every client's progress refreshes. A malformed body
 * 400s; a git/write failure 500s. Returns the stored event.
 */
function viewedRoute(cwd: string) {
  return HttpRouter.add(
    "POST",
    "/api/viewed",
    Effect.gen(function* postViewed() {
      const request = yield* HttpServerRequest.schemaBodyJson(ViewedRequest);
      const repo = yield* resolveRepo(cwd);
      const event = yield* appendViewedEvent({
        base: repo.defaultBranch.name,
        branch: repo.branch,
        request,
        root: repo.root,
      });
      return yield* HttpServerResponse.json(event);
    }).pipe(
      Effect.catchTag("SchemaError", (error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 400 })),
      ),
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 500 })),
      ),
    ),
  );
}

/**
 * `POST /api/findings` — append one Finding record (new Finding, reply, resolve,
 * or reopen) as a file drop into `.docent/`, the identical shape an agent writes
 * directly (architecture.md §2). Writing mints-or-reuses the live head's Change
 * and stamps its `changeId`; attribution is the human resolved from git config.
 * A malformed body 400s; a git/write failure 500s. The `.docent/` watch turns
 * the drop into an SSE push, so the UI refreshes without this response.
 */
function findingsRoute(cwd: string) {
  return HttpRouter.add(
    "POST",
    "/api/findings",
    Effect.gen(function* postFinding() {
      const write = yield* HttpServerRequest.schemaBodyJson(FindingWrite);
      const refs = yield* resolveChangeRefs(cwd);
      const author = yield* resolveAuthor(refs.root);
      const result = yield* writeFindingRecord({
        author,
        base: refs.defaultBranch.name,
        branch: refs.branch,
        refs: {
          baseRef: refs.defaultBranch.name,
          baseSha: refs.baseSha,
          headRef: refs.branch,
          headSha: refs.headSha,
        },
        root: refs.root,
        write,
      });
      return yield* HttpServerResponse.json(result);
    }).pipe(
      Effect.catchTag("SchemaError", (error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 400 })),
      ),
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 500 })),
      ),
    ),
  );
}

// SSE frames: an opening comment on connect, then a coarse change event per push.
const encoder = new TextEncoder();
function sseFrame(payload: string) {
  return encoder.encode(payload);
}
const SSE_OPEN = sseFrame(": connected\n\n");
const SSE_CHANGED = sseFrame("event: dossier-changed\ndata: {}\n\n");

/**
 * `GET /api/events` — the one-way SSE live-reload stream. Emits an opening
 * comment, then a `dossier-changed` frame each time the `.docent/` watch fires;
 * the browser re-fetches `GET /api/dossier` on receipt (architecture.md §2).
 */
const eventsRoute = HttpRouter.add(
  "GET",
  "/api/events",
  Effect.map(Effect.service(DocentWatch), (watch) =>
    HttpServerResponse.stream(
      Stream.concat(
        Stream.make(SSE_OPEN),
        Stream.map(Stream.fromPubSub(watch.events), () => SSE_CHANGED),
      ),
      {
        headers: {
          "cache-control": "no-cache",
          connection: "keep-alive",
          "content-type": "text/event-stream",
        },
      },
    ),
  ),
);

/**
 * The full server as a layer: building it binds the port and serves until the
 * layer's scope closes. Exposes `HttpServer` so callers can read `serverUrl`.
 */
export function layer(options: ServeOptions) {
  const routes = Layer.mergeAll(
    diffRoute(options.cwd),
    blobSizeRoute(options.cwd),
    blobRoute(options.cwd),
    captureRoute(options.cwd),
    pendingRoute(options.cwd),
    worktreeRoute(options.cwd),
    dossierRoute(options.cwd),
    viewedRoute(options.cwd),
    findingsRoute(options.cwd),
    eventsRoute,
    assetRoute(options.assets),
  );
  return HttpRouter.serve(routes, {
    disableListenLog: true,
    disableLogger: true,
  }).pipe(
    // The SSE route reads the `.docent/` watch; the watch reads git + fs, which
    // BunHttpServer's BunServices supply below.
    Layer.provide(watchLayer(options.cwd)),
    Layer.provideMerge(
      // Loopback only, IPv4: `127.0.0.1` (not `localhost`) so the printed URL
      // is reachable on hosts where `localhost` resolves to IPv6-only.
      // Port 0: the OS picks an ephemeral port; read it back via `serverUrl`.
      // idleTimeout 0: never drop the long-lived SSE connection for being idle.
      BunHttpServer.layer({ hostname: "127.0.0.1", idleTimeout: 0, port: 0 }),
    ),
  );
}
