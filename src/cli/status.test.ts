import { afterAll, describe, expect, test } from "bun:test";

import { cleanupScratchDirs, scratchRepo } from "@test-support/fixtures";
import { makeTestRuntime } from "@test-support/runtime";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { webHandler } from "../api";
import { writeServeAddress } from "../serve/address";
import { statusCommand } from "./status";
import { WorkingDirectory } from "./usage";

const runtime = makeTestRuntime();
const run = runtime.runPromise;
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

function status(cwd: string, argv: readonly string[]) {
  return Command.runWith(statusCommand, { version: "test" })(argv).pipe(
    Effect.provideService(WorkingDirectory, cwd)
  );
}

async function printedJson(
  command: ReturnType<typeof status>
): Promise<unknown> {
  const printed: string[] = [];

  await run(
    command.pipe(
      Effect.provideService(Console.Console, {
        ...globalThis.console,
        log: (...args: unknown[]) => {
          printed.push(args.join(" "));
        },
      })
    )
  );

  return JSON.parse(printed.join("\n"));
}

function serveDocent(repo: string): string {
  const { dispose, handler } = webHandler({ cwd: repo });
  const server = Bun.serve({
    fetch: (request) => handler(request),
    hostname: "127.0.0.1",
    port: 0,
  });

  servers.push(server);
  disposers.push(() => dispose());

  return server.url.href;
}

describe("docent status — end to end against a real server", () => {
  test("prints not-serving when no server has recorded an address", async () => {
    const repo = scratchRepo("docent-status-cli-");

    const printed = await printedJson(status(repo, []));

    expect(printed).toEqual({ serving: false });
  });

  test("prints the live server's url when one is serving this repo", async () => {
    const repo = scratchRepo("docent-status-cli-");
    const url = serveDocent(repo);
    await run(writeServeAddress(repo, url));

    const printed = await printedJson(status(repo, []));

    expect(printed).toEqual({ serving: true, url });
  });
});
