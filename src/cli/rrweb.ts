import { Effect, Stream } from "effect";
import { Stdio } from "effect/Stdio";
import { Command } from "effect/unstable/cli";

import { CliUsageError } from "./usage";

/**
 * Emits the recorder rather than injecting it: the driver holds the browser
 * session, and docent has no view of it. Bundled into the binary so the recorder
 * matches the Replayer that renders the captures it produces — resolving rrweb
 * from the repo under review pinned it to whatever that repo happened to have,
 * or to nothing at all.
 *
 * Written through the `Stdio` sink, which waits for the drain. `Console.log`
 * does not, and the bundle is orders of magnitude larger than a pipe buffer, so
 * `docent rrweb | …` — the one way this command is ever used — lost whatever had
 * not flushed by exit.
 */
export function rrwebCommand(recorderBundle: string) {
  return Command.make("rrweb", {}, () =>
    Effect.gen(function* runRrweb() {
      const stdio = yield* Stdio;
      const source = yield* Effect.tryPromise({
        catch: () =>
          new CliUsageError({
            reason: `the rrweb recorder is missing from this build (${recorderBundle})`,
          }),
        try: () => Bun.file(recorderBundle).text(),
      });

      return yield* Stream.make(source).pipe(Stream.run(stdio.stdout()));
    })
  ).pipe(
    Command.withDescription(
      "Print the bundled rrweb recorder, for a capture driver to eval into the app"
    )
  );
}
