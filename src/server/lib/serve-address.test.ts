import { afterAll, describe, expect, test } from "bun:test";

import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";

import { webHandler } from "../routes";
import {
  removeServeAddress,
  resolveServeStatus,
  writeServeAddress,
} from "./serve-address";
import { cleanupScratchDirs, scratchRepo } from "./test-fixtures";

const runtime = ManagedRuntime.make(BunServices.layer);
const servers: { stop: (closeActiveConnections?: boolean) => void }[] = [];
const disposers: (() => Promise<void>)[] = [];

afterAll(async () => {
  for (const server of servers) {
    server.stop(true);
  }
  await Promise.all(disposers.map((dispose) => dispose()));
  await runtime.dispose();
  cleanupScratchDirs();
});

/** Boot a real docent server for `repo` on an OS-picked port; return its base URL. */
function serveDocent(repo: string): {
  url: string;
  stop: () => Promise<void>;
} {
  const { handler, dispose } = webHandler({ cwd: repo });
  const server = Bun.serve({
    fetch: (request) => handler(request),
    hostname: "127.0.0.1",
    port: 0,
  });
  servers.push(server);
  disposers.push(() => dispose());
  return {
    stop: async () => {
      server.stop(true);
      await dispose();
    },
    url: server.url.href,
  };
}

function status(cwd: string) {
  return runtime.runPromise(resolveServeStatus(cwd));
}

describe("resolveServeStatus", () => {
  test("reports serving when the recorded address answers for this repo", async () => {
    const repo = scratchRepo("docent-serve-addr-");
    const { url } = serveDocent(repo);
    await runtime.runPromise(writeServeAddress(repo, url));

    const result = await status(repo);

    expect(result).toEqual({ serving: true, url });
  });

  test("reports not serving when no address has been recorded", async () => {
    const repo = scratchRepo("docent-serve-addr-");

    const result = await status(repo);

    expect(result).toEqual({ serving: false });
  });

  test("reports not serving when the recorded server is gone", async () => {
    const repo = scratchRepo("docent-serve-addr-");
    const server = serveDocent(repo);
    await runtime.runPromise(writeServeAddress(repo, server.url));
    await server.stop();

    const result = await status(repo);

    expect(result).toEqual({ serving: false });
  });

  test("reports not serving when the recorded address serves a different repo", async () => {
    const repoA = scratchRepo("docent-serve-addr-");
    const repoB = scratchRepo("docent-serve-addr-");
    const { url: urlB } = serveDocent(repoB);
    await runtime.runPromise(writeServeAddress(repoA, urlB));

    const result = await status(repoA);

    expect(result).toEqual({ serving: false });
  });

  test("reports not serving after the recorded address is removed", async () => {
    const repo = scratchRepo("docent-serve-addr-");
    const { url } = serveDocent(repo);
    await runtime.runPromise(writeServeAddress(repo, url));

    await runtime.runPromise(removeServeAddress(repo));
    const result = await status(repo);

    expect(result).toEqual({ serving: false });
  });
});
