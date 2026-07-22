import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";

/**
 * Builds a fresh {@link ManagedRuntime} backed by the real Bun platform
 * services (filesystem, process, git). The suite deliberately runs against
 * these real services rather than injecting test doubles, so tests exercise
 * the same code paths as production.
 *
 * Each test file owns its runtime and disposes it in `afterAll`; this is a
 * factory rather than a shared instance so files can't dispose each other's.
 *
 * @see docs/testing-standards.md
 */
export function makeTestRuntime() {
  return ManagedRuntime.make(BunServices.layer);
}
