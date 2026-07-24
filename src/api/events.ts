/**
 * The SSE stream never fails, so this route uses `HttpRouter.add` directly
 * rather than `apiRoute`'s error tail.
 */

import { Effect, Stream } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { DocentWatch } from "../serve/watch";

const encoder = new TextEncoder();
function sseFrame(payload: string) {
  return encoder.encode(payload);
}
const SSE_OPEN = sseFrame(": connected\n\n");
const SSE_CHANGED = sseFrame("event: review-changed\ndata: {}\n\n");

export const eventsRoute = HttpRouter.add(
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
