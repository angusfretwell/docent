/**
 * The `docent serve` API surface: the Effect routes behind the local server —
 * the live branch diff (`GET /api/diff`), raw git blobs for context expansion
 * (`GET /api/blob/:sha`), the active Review snapshot (`GET /api/review`), the
 * append-write endpoints (`POST /api/viewed`, `POST /api/findings`), and the
 * SSE live-reload stream (`GET /api/events`) fed by a `.docent/` watch.
 *
 * The browser UI itself is served by Bun's fullstack bundler at the entry
 * points (`bin.ts`, `dev.ts`), not by these routes: Bun's HTML-bundle route
 * owns `/` and the client assets, while these routes run one level down behind
 * `HttpRouter.toWebHandler` and see only the `/api/*` requests Bun falls
 * through. `webHandler` builds that handler with the watch and Bun services
 * merged in, so the entry points and the serve tests share one wiring.
 */

import { BunServices } from "@effect/platform-bun";
import { FindingWrite } from "@shared/schemas/finding-write";
import type { PendingRange } from "@shared/schemas/pending";
import { ViewedRequest } from "@shared/schemas/review";
import { Effect, Layer, Stream } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

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
import {
  appendViewedEvent,
  readReviewSnapshot,
  reviewDirPath,
} from "../services/review";
import { DocentWatch, layer as watchLayer } from "./watch";

export interface ServeOptions {
  /** Directory to resolve the git repo from (any path inside the repo). */
  cwd: string;
}

function diffRoute(cwd: string) {
  return HttpRouter.add(
    "GET",
    "/api/diff",
    resolveChange(cwd).pipe(
      Effect.flatMap((change) => HttpServerResponse.json(change)),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 500 }
          )
        )
      )
    )
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
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 400 }
          )
        )
      ),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 404 }
          )
        )
      )
    )
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
        { headers: { "cache-control": BLOB_CACHE_CONTROL } }
      );
    }).pipe(
      Effect.catchTag("InvalidObjectId", (error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 400 }
          )
        )
      ),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 404 }
          )
        )
      )
    )
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
 * capture blob, read off `.docent/reviews/<slug>/walkthroughs/product/<wlk>/
 * captures/<file>` (walkthroughs.md §3, §6). Unlike code ranges, capture media
 * is **not a git blob** — it lives in the gitignored Review, born with its
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
      if (
        !(WALKTHROUGH_ID.test(walkthrough) && CAPTURE_FILE.test(file)) ||
        file.includes("..")
      ) {
        return HttpServerResponse.jsonUnsafe(
          { error: "invalid capture path" },
          { status: 400 }
        );
      }
      const repo = yield* resolveRepo(cwd);
      const fs = yield* FileSystem;
      const path = yield* Path;
      const filePath = path.join(
        reviewDirPath(repo.root, repo.branch),
        "walkthroughs",
        "product",
        walkthrough,
        "captures",
        file
      );
      const bytes = yield* fs.readFile(filePath);
      return HttpServerResponse.uint8Array(bytes, {
        contentType: captureContentType(file),
        headers: { "cache-control": BLOB_CACHE_CONTROL },
      });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 404 }
          )
        )
      )
    )
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
        searchParams.get("range") === "cumulative"
          ? "cumulative"
          : "incremental";
      const pending = yield* resolvePending(cwd, range);
      return yield* HttpServerResponse.json(pending);
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 500 }
          )
        )
      )
    )
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
      const bytes = yield* resolveWorktreeFile(
        cwd,
        searchParams.get("path") ?? ""
      );
      return HttpServerResponse.uint8Array(bytes, {
        contentType: OCTET_STREAM,
        headers: { "cache-control": WORKTREE_CACHE_CONTROL },
      });
    }).pipe(
      Effect.catchTag("InvalidWorktreePath", (error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 400 }
          )
        )
      ),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 404 }
          )
        )
      )
    )
  );
}

/**
 * `GET /api/review` — the JSON snapshot of the active Review (the one for the
 * checked-out branch), walked live off `.docent/` on every request (uncached).
 * The Review auto-creates on first use; the branch/base come from git.
 */
function reviewRoute(cwd: string) {
  return HttpRouter.add(
    "GET",
    "/api/review",
    resolveRepo(cwd).pipe(
      Effect.flatMap((repo) =>
        readReviewSnapshot({
          base: repo.defaultBranch.name,
          branch: repo.branch,
          root: repo.root,
        })
      ),
      Effect.flatMap((snapshot) => HttpServerResponse.json(snapshot)),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 500 }
          )
        )
      )
    )
  );
}

/**
 * `POST /api/viewed` — append one mark-as-viewed toggle to the active Review's
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
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 400 }
          )
        )
      ),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 500 }
          )
        )
      )
    )
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
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 400 }
          )
        )
      ),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 500 }
          )
        )
      )
    )
  );
}

// SSE frames: an opening comment on connect, then a coarse change event per push.
const encoder = new TextEncoder();
function sseFrame(payload: string) {
  return encoder.encode(payload);
}
const SSE_OPEN = sseFrame(": connected\n\n");
const SSE_CHANGED = sseFrame("event: review-changed\ndata: {}\n\n");

/**
 * `GET /api/events` — the one-way SSE live-reload stream. Emits an opening
 * comment, then a `review-changed` frame each time the `.docent/` watch fires;
 * the browser re-fetches `GET /api/review` on receipt (architecture.md §2).
 */
const eventsRoute = HttpRouter.add(
  "GET",
  "/api/events",
  Effect.map(Effect.service(DocentWatch), (watch) =>
    HttpServerResponse.stream(
      Stream.concat(
        Stream.make(SSE_OPEN),
        Stream.map(Stream.fromPubSub(watch.events), () => SSE_CHANGED)
      ),
      {
        headers: {
          "cache-control": "no-cache",
          connection: "keep-alive",
          "content-type": "text/event-stream",
        },
      }
    )
  )
);

/**
 * Every `/api/*` route as one layer — the app behind the entry points' web
 * handler and driven directly by the serve tests. The browser UI is not here:
 * Bun's HTML-bundle route serves it at the entry level, and these routes see
 * only the requests Bun falls through to `fetch`.
 */
export function routes(options: ServeOptions) {
  return Layer.mergeAll(
    diffRoute(options.cwd),
    blobSizeRoute(options.cwd),
    blobRoute(options.cwd),
    captureRoute(options.cwd),
    pendingRoute(options.cwd),
    worktreeRoute(options.cwd),
    reviewRoute(options.cwd),
    viewedRoute(options.cwd),
    findingsRoute(options.cwd),
    eventsRoute
  );
}

/**
 * Build the `request → Promise<Response>` handler the entry points hand to
 * `Bun.serve`'s `fetch` and the serve tests call directly. Effect lives one
 * level down here (the entry points are plain Bun) because Effect's Bun server
 * swaps handlers via `server.reload`, which wipes Bun's HTML-bundle `routes`
 * table (@see docs/adr/0001-serve-via-bun-fullstack.md).
 *
 * The watch and Bun-services layers are `provideMerge`d, not `provide`d: the
 * route handlers read `FileSystem` / `Path` / the git spawner and the
 * `.docent/` watch per request, so those services must stay in the handler's
 * output context (`toWebHandler` excludes what a plain `provide` hides).
 */
export function webHandler(options: ServeOptions) {
  return HttpRouter.toWebHandler(
    routes(options).pipe(
      Layer.provideMerge(watchLayer(options.cwd)),
      Layer.provideMerge(BunServices.layer)
    ),
    { disableLogger: true }
  );
}
