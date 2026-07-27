import { Effect } from "effect";
import getPort, { portNumbers } from "get-port";

export const DEFAULT_PORT = 8037;

// How far past the preferred port to look before accepting a random one.
const PORT_RANGE = 20;

/** Resolves a free port at or above `start`, so a second repo can serve alongside the first. */
export const resolvePort = Effect.fn("resolvePort")(function* resolvePort(
  start: number
) {
  return yield* Effect.promise(() =>
    getPort({ port: portNumbers(start, start + PORT_RANGE) })
  );
});
