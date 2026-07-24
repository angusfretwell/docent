import { BunServices } from "@effect/platform-bun";
import { Layer, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

/**
 * Real Bun platform services, not test doubles, so tests exercise production
 * code paths. A factory (not a shared instance) so test files can't dispose each
 * other's runtime.
 *
 * @see docs/testing-standards.md
 */
export function makeTestRuntime() {
  return ManagedRuntime.make(
    Layer.mergeAll(BunServices.layer, FetchHttpClient.layer)
  );
}
