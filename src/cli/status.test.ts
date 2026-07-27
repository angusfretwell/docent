import { afterAll, describe, expect, test } from "bun:test";

import { cleanupScratchDirs, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Console, Effect, Exit } from "effect";
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

async function runStatus(
  command: ReturnType<typeof status>
): Promise<{ json: unknown; failed: boolean }> {
  const printed: string[] = [];

  const exit = await run(
    Effect.exit(
      command.pipe(
        Effect.provideService(Console.Console, {
          ...globalThis.console,
          log: (...args: unknown[]) => {
            printed.push(args.join(" "));
          },
        })
      )
    )
  );

  return { failed: Exit.isFailure(exit), json: JSON.parse(printed.join("\n")) };
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

    const { json } = await runStatus(status(repo, []));

    expect(json).toEqual({ serving: false });
  });

  test("fails when no server is running, so a caller can poll on the exit code", async () => {
    const repo = scratchRepo("docent-status-cli-");

    const { failed } = await runStatus(status(repo, []));

    expect(failed).toBe(true);
  });

  test("prints the live server's url when one is serving this repo", async () => {
    const repo = scratchRepo("docent-status-cli-");
    const url = serveDocent(repo);
    await run(writeServeAddress(repo, url));

    const { json } = await runStatus(status(repo, []));

    expect(json).toEqual({ serving: true, url });
  });

  test("succeeds when a server is serving this repo", async () => {
    const repo = scratchRepo("docent-status-cli-");
    const url = serveDocent(repo);
    await run(writeServeAddress(repo, url));

    const { failed } = await runStatus(status(repo, []));

    expect(failed).toBe(false);
  });
});
