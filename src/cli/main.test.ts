import { afterAll, describe, expect, test } from "bun:test";

import { cleanupScratchDirs, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Console, Effect, Runtime } from "effect";
import { Command } from "effect/unstable/cli";

import { commentCommand } from "./comment";
import { crash } from "./main";
import { WorkingDirectory } from "./usage";

const runtime = makeTestRuntime();

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

async function runCli(cwd: string, argv: readonly string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exit = await runtime.runPromise(
    Command.runWith(commentCommand, { version: "test" })(argv).pipe(
      Effect.catch(crash),
      Effect.provideService(WorkingDirectory, cwd),
      Effect.provideService(Console.Console, {
        ...globalThis.console,
        error: (...args: unknown[]) => {
          stderr.push(args.join(" "));
        },
        log: (...args: unknown[]) => {
          stdout.push(args.join(" "));
        },
      }),
      Effect.exit
    )
  );

  let exitCode = -1;
  Runtime.defaultTeardown(exit, (code) => {
    exitCode = code;
  });

  return { exitCode, stderr, stdout };
}

describe("the shared failure tail", () => {
  test("a rejected invocation exits non-zero with its message on stderr and no result on stdout", async () => {
    const repo = scratchRepo("docent-cli-tail-");

    const result = await runCli(repo, ["list", "--status", "bogus"]);

    expect(result).toEqual({
      exitCode: 1,
      stderr: ["unknown --status: bogus (one of actioned, open, resolved)"],
      stdout: [],
    });
  });
});
