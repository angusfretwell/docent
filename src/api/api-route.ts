import { Effect } from "effect";
import type { Schema } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

import { resolveRepo } from "../core/git";

type ApiMethod = Parameters<typeof HttpRouter.add>[0];
type ApiPath = Parameters<typeof HttpRouter.add>[1];

type ApiHandler<E, R> =
  | Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
  | ((
      request: HttpServerRequest.HttpServerRequest
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>);

interface TaggedMessage {
  readonly _tag: string;
  readonly message: string;
}

/**
 * Distributive conditional, not `E["_tag"]`: an indexed access in target
 * position takes the write type — `never` for any channel with more than one
 * tag. Distributing keeps a route's tags checked against real tags even when
 * part of the channel is a still-free generic.
 */
type ErrorTag<E> = E extends TaggedMessage ? E["_tag"] : never;

export interface ApiRouteOptions<Tag extends string> {
  readonly badRequest?: Tag | readonly Tag[];
  readonly notFound?: boolean;
}

function errorResponse(error: TaggedMessage, status: number) {
  return Effect.succeed(
    HttpServerResponse.jsonUnsafe({ error: error.message }, { status })
  );
}

function badRequestTags(
  tags: string | readonly string[] | undefined
): readonly string[] {
  if (tags === undefined) {
    return [];
  }

  return typeof tags === "string" ? [tags] : tags;
}

/**
 * One `Effect.catch` comparing `_tag` at runtime, not `Effect.catchTag`: the
 * tail must discharge `E` all the way to `never`, and `catchTag` is partial —
 * `ExcludeTag<E, E["_tag"]>` doesn't reduce to `never` for a generic `E`.
 */
function withErrorTail<E extends TaggedMessage, R>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  options: ApiRouteOptions<ErrorTag<E>>
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> {
  const badRequests = badRequestTags(options.badRequest);

  return effect.pipe(
    Effect.catch((error) => {
      const isBadRequest = badRequests.includes(error._tag);

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

export function apiRoute<E extends TaggedMessage, R>(
  method: ApiMethod,
  path: ApiPath,
  effect: ApiHandler<E, R>,
  options: ApiRouteOptions<ErrorTag<E>> = {}
) {
  const tailed = Effect.isEffect(effect)
    ? withErrorTail(effect, options)
    : (request: HttpServerRequest.HttpServerRequest) =>
        withErrorTail(effect(request), options);
  return HttpRouter.add(method, path, tailed);
}

export function postWriteRoute<
  A,
  RD,
  Result,
  WriteError extends TaggedMessage,
  WriteContext,
>(
  path: ApiPath,
  schema: Schema.ConstraintDecoder<A, RD>,
  write: (body: A) => Effect.Effect<Result, WriteError, WriteContext>
) {
  const handler = Effect.gen(function* postWrite() {
    const body = yield* HttpServerRequest.schemaBodyJson(schema);
    const result = yield* write(body);
    return yield* HttpServerResponse.json(result);
  });

  return apiRoute("POST", path, handler, {
    badRequest: ["SchemaError", "HttpServerError"],
  });
}

export const readScope = Effect.fn("readScope")(function* readScope(
  cwd: string
) {
  const { branch, defaultBranch, root } = yield* resolveRepo(cwd);
  return { base: defaultBranch.name, branch, root };
});

export { resolveChangeScope as readChangeScope } from "../core/write-context";

const REQUEST_URL_BASE = "http://localhost";

export function searchParams(
  request: HttpServerRequest.HttpServerRequest
): URLSearchParams {
  return new URL(request.url, REQUEST_URL_BASE).searchParams;
}

export function requiredParam(value: string | null | undefined): string {
  return value ?? "";
}

export function badRequest(message: string) {
  return HttpServerResponse.jsonUnsafe({ error: message }, { status: 400 });
}

export const OCTET_STREAM = "application/octet-stream";

/** Content-addressed bytes never change: cache a year, immutable so the browser never revalidates. */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** The working tree is mutable with no stable SHA — its live bytes must never be cached. */
const NO_STORE_CACHE_CONTROL = "no-store";

export function immutableBytes(bytes: Uint8Array, contentType: string) {
  return HttpServerResponse.uint8Array(bytes, {
    contentType,
    headers: { "cache-control": IMMUTABLE_CACHE_CONTROL },
  });
}

export function uncachedBytes(bytes: Uint8Array, contentType: string) {
  return HttpServerResponse.uint8Array(bytes, {
    contentType,
    headers: { "cache-control": NO_STORE_CACHE_CONTROL },
  });
}
