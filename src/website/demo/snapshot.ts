/**
 * The demo snapshot format — the contract between the capture harness that
 * writes `demo-snapshot.json` and the `replayHandler` that serves it.
 */

import { Schema } from "effect";

export const RecordedResponse = Schema.Struct({
  body: Schema.String,
  /** Only the headers worth replaying: `content-type`, `cache-control`. */
  headers: Schema.Record(Schema.String, Schema.String),
  status: Schema.Number,
});
export type RecordedResponse = typeof RecordedResponse.Type;

/** Keyed by `requestKey`, so a recording and a replay of the same request agree. */
export const DemoSnapshot = Schema.Struct({
  responses: Schema.Record(Schema.String, RecordedResponse),
});
export type DemoSnapshot = typeof DemoSnapshot.Type;

/** Only ever parses relative urls into an absolute one; the origin is never keyed on. */
const KEY_ORIGIN = "http://demo.invalid";

function withoutBasepath(pathname: string, basepath: string): string {
  if (basepath === "" || !pathname.startsWith(basepath)) {
    return pathname;
  }

  return pathname.slice(basepath.length) || "/";
}

/**
 * `${METHOD} ${pathname}${search}`, origin- and basepath-relative with search
 * params sorted — the demo is served under a basepath, so the same request
 * arrives as `/demo/api/review` and is recorded as `GET /api/review`.
 */
export function requestKey(request: {
  basepath?: string;
  method: string;
  url: string;
}): string {
  const url = new URL(request.url, KEY_ORIGIN);
  url.searchParams.sort();

  const pathname = withoutBasepath(url.pathname, request.basepath ?? "");

  return `${request.method.toUpperCase()} ${pathname}${url.search}`;
}

function split(key: string): { method: string; target: string } {
  const separator = key.indexOf(" ");

  return { method: key.slice(0, separator), target: key.slice(separator + 1) };
}

/** The inverse of `requestKey`, for replaying a recorded key back through a handler. */
export function requestFromKey(key: string): Request {
  const { method, target } = split(key);

  return new Request(new URL(target, KEY_ORIGIN), { method });
}
