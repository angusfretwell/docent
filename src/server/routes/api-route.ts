/**
 * The seam every `/api/*` route builder is defined through: `apiRoute()` wraps
 * `HttpRouter.add` with the error-response tail repeated across the routes
 * (data-model.md §1, architecture.md §2) — a typed `_tag` answered as 400,
 * everything else as 404 or 500, always `{ error: message }` JSON — plus the
 * small byte/response helpers the raw-bytes routes (blob, capture, worktree)
 * share.
 */

import { Effect } from "effect";
import type { HttpServerRequest } from "effect/unstable/http";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

// The method/path types `HttpRouter.add` itself accepts — derived so this
// seam can never drift from the router it wraps.
type ApiMethod = Parameters<typeof HttpRouter.add>[0];
type ApiPath = Parameters<typeof HttpRouter.add>[1];

/** A route's handler: an effect, or a function of the request that returns one. */
type ApiHandler<E, R> =
  | Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
  | ((
      request: HttpServerRequest.HttpServerRequest
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>);

/** The minimum shape every typed error reaching the tail carries. */
interface TaggedMessage {
  readonly _tag: string;
  readonly message: string;
}

export interface ApiRouteOptions<Tag extends string> {
  /**
   * A `_tag` to answer 400 with `{ error: message }` instead of falling
   * through to the route's default status.
   */
  readonly badRequest?: Tag;
  /**
   * When set, every error not caught by `badRequest` answers 404 instead of
   * the default 500 — the shape a resolve-then-read route wants (an absent
   * id/path reads as "not found"; anything else is a genuine failure).
   */
  readonly notFound?: boolean;
}

function errorResponse(error: TaggedMessage, status: number) {
  return Effect.succeed(
    HttpServerResponse.jsonUnsafe({ error: error.message }, { status })
  );
}

/**
 * Apply the `{ badRequest, notFound }` tail to one route's effect. A generic
 * `E["_tag"]` can't drive `Effect.catchTag`'s literal-narrowing overload (it
 * only resolves to a plain `string` for an unconstrained `E`), so the tag
 * compare is a plain runtime check inside one `Effect.catch` instead.
 */
function withErrorTail<E extends TaggedMessage, R>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  options: ApiRouteOptions<E["_tag"]>
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> {
  return effect.pipe(
    Effect.catch((error) => {
      const isBadRequest =
        options.badRequest !== undefined && error._tag === options.badRequest;

      let status = 500;
      if (isBadRequest) {
        status = 400;
      } else if (options.notFound) {
        status = 404;
      }

      return errorResponse(error, status);
    })
  );
}

/**
 * Build one `/api/*` route: `HttpRouter.add(method, path, …)` with the
 * repeated error tail applied underneath. `effect` is exactly what
 * `HttpRouter.add` itself accepts — a bare effect, or a function of the
 * request — so a route that needs the request (`pending`, `worktree`) shapes
 * it that way and one that doesn't (`diff`, `health`) hands the effect
 * directly.
 *
 * @param options.badRequest a `_tag` whose error answers 400
 * @param options.notFound answer every other error 404 instead of 500
 */
export function apiRoute<E extends TaggedMessage, R>(
  method: ApiMethod,
  path: ApiPath,
  effect: ApiHandler<E, R>,
  options: ApiRouteOptions<E["_tag"]> = {}
) {
  const tailed = Effect.isEffect(effect)
    ? withErrorTail(effect, options)
    : (request: HttpServerRequest.HttpServerRequest) =>
        withErrorTail(effect(request), options);
  return HttpRouter.add(method, path, tailed);
}

// Base for parsing a request's relative URL; only the path/query is read from
// it (pending, worktree).
const REQUEST_URL_BASE = "http://localhost";

/** A request's query-string parameters, parsed off its (always relative) URL. */
export function searchParams(
  request: HttpServerRequest.HttpServerRequest
): URLSearchParams {
  return new URL(request.url, REQUEST_URL_BASE).searchParams;
}

/** The opaque byte-stream content-type for raw blobs and worktree files. */
export const OCTET_STREAM = "application/octet-stream";

// A git object id (and a capture blob's content-addressed filename) is
// immutable, so its bytes never change: cache for a year and mark immutable
// so the browser never revalidates content it already has. Exported for the
// one route (`blob`'s size lookup) that wraps it around JSON, not bytes.
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

// The working tree is mutable with no stable SHA to cache against, so its
// live bytes must never be cached (diff-review.md §6, architecture.md §2).
const NO_STORE_CACHE_CONTROL = "no-store";

/** A raw byte response cached forever — content-addressed: blobs, captures. */
export function immutableBytes(bytes: Uint8Array, contentType: string) {
  return HttpServerResponse.uint8Array(bytes, {
    contentType,
    headers: { "cache-control": IMMUTABLE_CACHE_CONTROL },
  });
}

/** A raw byte response that is never cached — the live working tree. */
export function uncachedBytes(bytes: Uint8Array, contentType: string) {
  return HttpServerResponse.uint8Array(bytes, {
    contentType,
    headers: { "cache-control": NO_STORE_CACHE_CONTROL },
  });
}
