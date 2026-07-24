import { Console, Effect, Schema } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";
import { ChildProcess } from "effect/unstable/process";

import { resolveRepo } from "../core/git";
import { ensureStateRootGitignore } from "../core/store/layout";
import { CliUsageError, WorkingDirectory } from "./usage";

const SKILLS_SOURCE = "angusfretwell/docent";

export type InstallScope = "project" | "global";

export class SkillsInstallFailed extends Schema.TaggedErrorClass<SkillsInstallFailed>()(
  "SkillsInstallFailed",
  {
    exitCode: Schema.Number,
  }
) {
  override get message(): string {
    return `skill install failed — \`npx skills\` exited ${this.exitCode}`;
  }
}

/** The parser silently drops arguments no parameter claims, so without this guard a stray positional would start a skill install nobody asked for. */
function refusePositionals(
  args: readonly string[]
): Effect.Effect<void, CliUsageError> {
  const stray = args.at(0);

  return stray === undefined
    ? Effect.void
    : Effect.fail(
        new CliUsageError({
          reason: `install takes no positional arguments (got ${stray})`,
        })
      );
}

/** No shell runs these args, so the `*` reaches the skills CLI verbatim. */
function skillsAddArgs(scope: InstallScope): readonly string[] {
  const args = ["skills", "add", SKILLS_SOURCE, "-s", "*", "-y"];
  return scope === "global" ? [...args, "-g"] : args;
}

const scopeQuestion: Prompt.Prompt<InstallScope> = Prompt.select({
  choices: [
    {
      description: "Only this repo's agent sessions get docent's skills",
      title: "This repo",
      value: "project",
    },
    {
      description: "Every repo on this machine gets docent's skills",
      title: "All repos",
      value: "global",
    },
  ],
  message: "Install docent's agent skills for",
});

/** An Effect so the choice is made when the flag is actually missing, not when the command tree is built. */
const scopeFallback: Effect.Effect<Prompt.Prompt<InstallScope>> = Effect.sync(
  () =>
    process.stdin.isTTY
      ? scopeQuestion
      : Prompt.succeed<InstallScope>("project")
);

const runSkills = Effect.fn("runSkills")(function* runSkills(
  root: string,
  scope: InstallScope
) {
  const handle = yield* ChildProcess.make("npx", skillsAddArgs(scope), {
    cwd: root,
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  });
  const exitCode = yield* handle.exitCode;

  if (exitCode !== 0) {
    return yield* Effect.fail(new SkillsInstallFailed({ exitCode }));
  }
}, Effect.scoped);

export const installCommand = Command.make(
  "install",
  {
    args: Argument.string("arg").pipe(
      Argument.variadic(),
      Argument.withDescription(
        "Not accepted — install's only choice is a scope flag"
      )
    ),
    scope: Flag.choice("scope", ["project", "global"]).pipe(
      Flag.withDescription(
        "Install for this repo (project) or every repo on this machine (global)"
      ),
      Flag.withFallbackPrompt(scopeFallback)
    ),
  },
  (config) =>
    Effect.gen(function* runInstall() {
      const cwd = yield* WorkingDirectory;
      yield* refusePositionals(config.args);
      const root = yield* resolveRepo(cwd).pipe(
        Effect.map((repo) => repo.root),
        Effect.orElseSucceed(() => cwd)
      );

      yield* Console.log(
        "docent install — installing docent's agent skills for your coding agent."
      );
      yield* Console.log(
        config.scope === "global"
          ? "→ user scope: all repos on this machine."
          : "→ project scope: this repo."
      );
      yield* runSkills(root, config.scope);

      yield* ensureStateRootGitignore(root);

      yield* Console.log("");
      yield* Console.log(
        "Done. Run `/docent` in your agent session to generate a walkthrough."
      );
      yield* Console.log(
        "Re-run `docent install` any time to update the skills."
      );
    })
).pipe(
  Command.withDescription("Install docent's agent skills for your coding agent")
);
