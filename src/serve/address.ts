/**
 * `docent serve` climbs to the first free port, so there is no fixed port to
 * probe: it records its live URL to `.docent/serve.json` on boot and removes it
 * on shutdown. Detection reads that address and confirms the server is alive *and*
 * serving this repo via `GET /api/health` — a stale file simply fails the probe,
 * so no cleanup lock is load-bearing (agent-integration.md §3.1).
 */

import { Effect, Option, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { resolveRepo } from "../core/git";
import { readRecord, writeJsonRecord } from "../core/store/io";
import { STATE_ROOT } from "../core/store/layout";

const ADDRESS_FILENAME = "serve.json";

// Short probe timeout: a slow-but-alive server still reads as serving, a dead
// port fails fast.
const PROBE_TIMEOUT_MS = 1500;

export const ServeAddress = Schema.Struct({
  schema: Schema.Literal("docent/serve-address"),
  url: Schema.String,
});
export type ServeAddress = typeof ServeAddress.Type;

export interface ServeStatus {
  readonly serving: boolean;
  readonly url?: string;
}

// `/api/health` echoes the repo it serves, so a recycled port answering for a
// different repo is rejected — only the root need match.
const Health = Schema.Struct({ root: Schema.String });

function addressPath(root: string, path: Path): string {
  return path.join(root, STATE_ROOT, ADDRESS_FILENAME);
}

export const writeServeAddress = Effect.fn("writeServeAddress")(
  function* writeServeAddress(root: string, url: string) {
    const fs = yield* FileSystem;
    const path = yield* Path;
    const address: ServeAddress = {
      schema: "docent/serve-address",
      url,
    };

    yield* fs.makeDirectory(path.join(root, STATE_ROOT), { recursive: true });
    yield* writeJsonRecord(addressPath(root, path), ServeAddress, address);
  }
);

export const removeServeAddress = Effect.fn("removeServeAddress")(
  function* removeServeAddress(root: string) {
    const fs = yield* FileSystem;
    const path = yield* Path;

    yield* fs.remove(addressPath(root, path), { force: true });
  }
);

const probeHealth = Effect.fn("probeHealth")(function* probeHealth(
  url: string,
  expectedRoot: string
) {
  const health = yield* HttpClient.get(new URL("api/health", url)).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Health)),
    Effect.timeout(PROBE_TIMEOUT_MS),
    Effect.option
  );

  return Option.match(health, {
    onNone: () => false,
    onSome: (value) => value.root === expectedRoot,
  });
});

/** Side-effect-free: a stale file simply fails the probe, so callers never race a cleanup. */
export const resolveServeStatus = Effect.fn("resolveServeStatus")(
  function* resolveServeStatus(cwd: string) {
    const repo = yield* resolveRepo(cwd);
    const path = yield* Path;
    const address = yield* readRecord(
      addressPath(repo.root, path),
      ServeAddress
    );

    if (Option.isNone(address)) {
      return { serving: false } satisfies ServeStatus;
    }

    const { url } = address.value;
    const alive = yield* probeHealth(url, repo.root);

    return (
      alive ? { serving: true, url } : { serving: false }
    ) satisfies ServeStatus;
  }
);
