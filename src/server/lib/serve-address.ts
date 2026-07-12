/**
 * The `docent serve` address file and its liveness detection — the "is a server
 * already up for this repo?" primitive `/docent` needs to reuse a running server
 * instead of starting a second one (agent-integration.md §3.1).
 *
 * `docent serve` binds an OS-picked port (`bin.ts`, `port: 0`), so no fixed port
 * exists to probe. On boot it records its live URL to `.docent/serve.json` — a
 * machine-local file the `.docent/.gitignore` `*` policy already ignores — and
 * removes it on shutdown. Detection reads that address and confirms the server
 * is genuinely alive *and* serving this repo by probing `GET /api/health`: a
 * stale file (server crashed, or its port was recycled by an unrelated process)
 * fails the probe and reads as not-serving, so no cleanup lock is load-bearing.
 */

import { Effect, Option, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { resolveRepo } from "../services/git";
import { readRecord } from "../store/io";

const STATE_ROOT = ".docent";
const ADDRESS_FILENAME = "serve.json";

// A slow-but-alive server should still read as serving, and a dead port should
// fail fast — a short probe timeout balances both for a one-shot detection.
const PROBE_TIMEOUT_MS = 1500;

/** The recorded address of a live `docent serve` process for a repo. */
export const ServeAddress = Schema.Struct({
  schema: Schema.Literal("docent/serve-address@1"),
  url: Schema.String,
});
export type ServeAddress = typeof ServeAddress.Type;

/** Whether a docent server is live for the repo, and where to reach it. */
export interface ServeStatus {
  readonly serving: boolean;
  readonly url?: string;
}

// `/api/health` echoes the repo it serves, so a recycled port answering for a
// *different* repo is rejected — only the root need match to confirm identity.
const Health = Schema.Struct({ root: Schema.String });

function addressPath(root: string, path: Path): string {
  return path.join(root, STATE_ROOT, ADDRESS_FILENAME);
}

/** Record the live server's URL so detection can find and reuse it. */
export const writeServeAddress = Effect.fn("writeServeAddress")(
  function* writeServeAddress(root: string, url: string) {
    const fs = yield* FileSystem;
    const path = yield* Path;
    const address: ServeAddress = {
      schema: "docent/serve-address@1",
      url,
    };

    yield* fs.makeDirectory(path.join(root, STATE_ROOT), { recursive: true });
    yield* fs.writeFileString(
      addressPath(root, path),
      `${JSON.stringify(address, null, 2)}\n`
    );
  }
);

/** Clear the recorded address on shutdown; a missing file is not an error. */
export const removeServeAddress = Effect.fn("removeServeAddress")(
  function* removeServeAddress(root: string) {
    const fs = yield* FileSystem;
    const path = yield* Path;

    yield* fs.remove(addressPath(root, path), { force: true });
  }
);

/** Probe `<url>/api/health`, true only when it answers for `expectedRoot`. */
const probeHealth = Effect.fn("probeHealth")(function* probeHealth(
  url: string,
  expectedRoot: string
) {
  const health = yield* Effect.tryPromise(() =>
    fetch(new URL("api/health", url).href, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    }).then((response) => response.json() as Promise<unknown>)
  ).pipe(
    Effect.flatMap((json) => Schema.decodeUnknownEffect(Health)(json)),
    Effect.option
  );

  return Option.match(health, {
    onNone: () => false,
    onSome: (value) => value.root === expectedRoot,
  });
});

/**
 * Resolve whether a docent server is already serving this repo: read the
 * recorded address and confirm it is live for this exact root. Side-effect-free
 * — a stale file simply fails the probe, so callers never race a cleanup.
 */
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
