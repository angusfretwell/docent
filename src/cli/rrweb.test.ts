import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { createContext, runInContext } from "node:vm";

import { makeTestRuntime } from "@test/runtime";
import { Command } from "effect/unstable/cli";

import { ensureRecorder, recorderBundle } from "../../scripts/build-recorder";
import { ensureDiffWorker } from "../../scripts/build-worker";
import { rrwebCommand } from "./rrweb";

const runtime = makeTestRuntime();

const entry = path.join(import.meta.dir, "..", "docent.ts");

/**
 * Read through a real pipe, which is the only place the drain matters: an
 * unflushed `console.log` prints the whole bundle to a terminal and truncates it
 * to whatever fit in the pipe buffer.
 */
async function piped(): Promise<string> {
  const child = Bun.spawn([process.execPath, "run", entry, "rrweb"], {
    stdout: "pipe",
  });

  const [source] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);

  return source;
}

let printed = "";

beforeAll(async () => {
  await Promise.all([ensureRecorder(), ensureDiffWorker()]);

  printed = await piped();
});

afterAll(async () => {
  await runtime.dispose();
});

describe("docent rrweb — the recorder the capture driver evals", () => {
  test("prints a bundle that publishes rrweb.record on the page's global", () => {
    const page: { rrweb?: { record?: unknown } } = {};

    runInContext(printed, createContext(page));

    expect(typeof page.rrweb?.record).toBe("function");
  });

  test("prints the whole bundle down a pipe", async () => {
    const bundled = await Bun.file(recorderBundle).text();

    expect(printed).toBe(bundled);
  });

  test("fails with the path when the build left no recorder behind", async () => {
    const missing = path.join(import.meta.dir, "no-such-recorder.js");

    const exit = await runtime.runPromiseExit(
      Command.runWith(rrwebCommand(missing), { version: "test" })([])
    );

    expect(exit._tag).toBe("Failure");
  });
});
