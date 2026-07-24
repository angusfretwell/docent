import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cleanupScratchDirs, scratchDir, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { installCommand } from "./install";
import { WorkingDirectory } from "./usage";

const runtime = makeTestRuntime();
const run = runtime.runPromise;

/**
 * Install shells out to the real skills CLI, so the suite puts a recording
 * `npx` first on `PATH` — the one boundary it stubs, and the only way to run
 * the command without installing anything on the machine.
 */
let stubbedNpxArgv = "";
let realPath: string | undefined;
let realIsTTY: boolean | undefined;

beforeAll(() => {
  const bin = scratchDir("docent-install-bin-");
  stubbedNpxArgv = path.join(bin, "argv.txt");
  writeFileSync(
    path.join(bin, "npx"),
    `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(stubbedNpxArgv)}\n`,
    { mode: 0o755 }
  );

  realPath = process.env.PATH;
  process.env.PATH = `${bin}:${realPath ?? ""}`;

  // A missing --scope falls back to the interactive scope prompt when stdin is
  // a TTY, which would block the suite under a real terminal. Pin it off so the
  // fallback deterministically takes non-interactive project scope.
  realIsTTY = process.stdin.isTTY;
  process.stdin.isTTY = false;
});

afterAll(async () => {
  process.env.PATH = realPath;
  process.stdin.isTTY = realIsTTY as typeof process.stdin.isTTY;
  await runtime.dispose();
  cleanupScratchDirs();
});

/** Run `docent install <argv>` against a fresh repo, returning the skills CLI's argv. */
async function installed(argv: readonly string[]): Promise<string[]> {
  rmSync(stubbedNpxArgv, { force: true });

  await run(
    Command.runWith(installCommand, { version: "test" })(argv).pipe(
      Effect.provideService(
        WorkingDirectory,
        scratchRepo("docent-install-cli-")
      ),
      Effect.provideService(Console.Console, {
        ...globalThis.console,
        log: () => {},
      })
    )
  );

  return readFileSync(stubbedNpxArgv, "utf-8").trim().split("\n");
}

describe("docent install — the argv surface", () => {
  test("a stray positional is refused before any install starts", async () => {
    rmSync(stubbedNpxArgv, { force: true });

    const error = await run(
      Effect.flip(
        Command.runWith(installCommand, { version: "test" })(["./here"]).pipe(
          Effect.provideService(
            WorkingDirectory,
            scratchRepo("docent-install-cli-")
          ),
          Effect.provideService(Console.Console, {
            ...globalThis.console,
            log: () => {},
          })
        )
      )
    );

    expect({
      message: error.message,
      skillsRan: existsSync(stubbedNpxArgv),
    }).toEqual({
      message: "install takes no positional arguments (got ./here)",
      skillsRan: false,
    });
  });
});

describe("docent install — end to end through the skills CLI", () => {
  test("project scope selects every shipped skill, non-interactively, not machine-wide", async () => {
    const argv = await installed(["--scope", "project"]);

    expect(argv).toEqual([
      "skills",
      "add",
      "angusfretwell/docent",
      "-s",
      "*",
      "-y",
    ]);
  });

  test("global scope installs the same skills machine-wide", async () => {
    const argv = await installed(["--scope", "global"]);

    expect(argv).toContain("-g");
  });
});
