/**
 * The `docent install` subcommand — the onboarding wizard (architecture.md §5,
 * agent-integration.md §3.5). It explains it is about to install docent's agent
 * skills, asks exactly one question — **project** scope (this repo) or **user**
 * scope (all repos) — then delegates to the skills CLI
 * (`npx skills add … -s '*' -y`, plus `-g` for user scope), letting its own
 * agent detection choose targets non-interactively. It seeds the
 * `.docent/.gitignore` commit policy (data-model.md §1) and prints next steps
 * pointing at `/docent`.
 *
 * `--scope project` / `--scope global` skip the question; a run with no TTY to
 * answer on takes project scope. Re-running install is the documented update
 * story: `@latest` re-resolves the
 * binary and the skill install refreshes the shipped skills — install is
 * idempotent.
 */

import { Console, Effect, Schema } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";
import { ChildProcess } from "effect/unstable/process";

import { resolveRepo } from "../core/git";
import { ensureStateRootGitignore } from "../core/store/layout";
import { CliUsageError, WorkingDirectory } from "./usage";

/** The skills.sh source the CLI installs from: this repo's shipped skills. */
const SKILLS_SOURCE = "angusfretwell/docent";

/** Install target: this repo (`project`) or every repo on the machine (`global`). */
export type InstallScope = "project" | "global";

/** The skills CLI exited non-zero — a typed failure through the shared crash tail. */
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

/**
 * Refuse any positional argument. Install's one question is a scope, never a
 * path — and the parser silently drops arguments no parameter claims, so a
 * stray one would otherwise start a real skill install the caller did not ask
 * for.
 */
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

/**
 * The `npx` args for a scope: install the shipped skills, select them all
 * (`-s '*'`), non-interactively (`-y`), and — for user scope — machine-wide
 * (`-g`). No shell runs these, so `*` reaches the CLI verbatim.
 */
function skillsAddArgs(scope: InstallScope): readonly string[] {
  const args = ["skills", "add", SKILLS_SOURCE, "-s", "*", "-y"];
  return scope === "global" ? [...args, "-g"] : args;
}

/** Install's one question — project scope (this repo) or user scope (all repos). */
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

/**
 * What a missing `--scope` falls back to. A scripted run has no TTY to answer
 * on, so it takes project scope rather than blocking on a question nobody can
 * see; the fallback is an Effect so that choice is made when the flag is
 * actually missing, not when the command is built.
 */
const scopeFallback: Effect.Effect<Prompt.Prompt<InstallScope>> = Effect.sync(
  () =>
    process.stdin.isTTY
      ? scopeQuestion
      : Prompt.succeed<InstallScope>("project")
);

/** Shell out to `npx skills add …`, inheriting stdio so its detection is visible. */
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

/** The `docent install` subcommand — install docent's agent skills. */
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
