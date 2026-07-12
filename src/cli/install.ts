/**
 * The `docent install` subcommand — the onboarding wizard (architecture.md §5,
 * agent-integration.md §3.5). It explains it is about to install docent's agent
 * skills, asks exactly one question — **project** scope (this repo, the default)
 * or **user** scope (all repos) — then delegates to the skills CLI
 * (`npx skills add … -s '*' -y`, plus `-g` for user scope), letting its own
 * agent detection choose targets non-interactively. It seeds the
 * `.docent/.gitignore` commit policy (data-model.md §1) and prints next steps
 * pointing at `/docent`.
 *
 * `--project` / `--global` skip the prompt for scripted runs. Re-running install
 * is the documented update story: `@latest` re-resolves the binary and the skill
 * install refreshes the shipped skills — install is idempotent.
 */

import { Console, Effect, Schema } from "effect";
import { ChildProcess } from "effect/unstable/process";

import { resolveRepo } from "../core/git";
import { ensureStateRootGitignore } from "../core/store/layout";
import { attempt, CliUsageError } from "./args";

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
 * Parse `install [--project|--global]` argv into a scope, or `undefined` when
 * neither flag is given (the prompt then decides). `--project` and `--global`
 * are mutually exclusive; any positional or other flag is a usage error.
 */
export function parseInstallArgs(
  argv: readonly string[]
): InstallScope | undefined {
  let scope: InstallScope | undefined;
  for (const token of argv) {
    if (token === "--project" || token === "--global") {
      const next: InstallScope = token === "--project" ? "project" : "global";
      if (scope !== undefined && scope !== next) {
        throw new CliUsageError({
          reason: "--project and --global are mutually exclusive",
        });
      }
      scope = next;
      continue;
    }
    if (token.startsWith("--")) {
      throw new CliUsageError({ reason: `unknown flag: ${token}` });
    }
    throw new CliUsageError({
      reason: `install takes no positional arguments (got ${token})`,
    });
  }
  return scope;
}

/**
 * The `npx` args for a scope: install the shipped skills, select them all
 * (`-s '*'`), non-interactively (`-y`), and — for user scope — machine-wide
 * (`-g`). No shell runs these, so `*` reaches the CLI verbatim.
 */
export function skillsAddArgs(scope: InstallScope): readonly string[] {
  const args = ["skills", "add", SKILLS_SOURCE, "-s", "*", "-y"];
  return scope === "global" ? [...args, "-g"] : args;
}

/** Ask the one question — project (default) or user scope. Non-TTY defaults to project. */
const promptScope = Effect.sync((): InstallScope => {
  if (!process.stdin.isTTY) {
    return "project";
  }

  // `prompt` is the browser-flavored name the rule guards against, but this is
  // the CLI binary asking its one onboarding question on a TTY — the intended use.
  // oxlint-disable-next-line no-alert
  const answer = prompt(
    "Install for [1] this repo (default) or [2] all repos? [1/2]"
  );
  const choice = answer?.trim().toLowerCase();

  return choice === "2" || choice === "global" || choice === "user"
    ? "global"
    : "project";
});

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

/**
 * Run one `docent install` invocation: explain, resolve the scope (flag or
 * prompt), install the skills, seed the commit policy, and print next steps.
 */
export const runInstall = Effect.fn("runInstall")(function* runInstall(
  cwd: string,
  argv: readonly string[]
) {
  const flagScope = yield* attempt(() => parseInstallArgs(argv));
  const root = yield* resolveRepo(cwd).pipe(
    Effect.map((repo) => repo.root),
    Effect.orElseSucceed(() => cwd)
  );

  yield* Console.log(
    "docent install — installing docent's agent skills for your coding agent."
  );

  const scope = flagScope ?? (yield* promptScope);

  yield* Console.log(
    scope === "global"
      ? "→ user scope: all repos on this machine."
      : "→ project scope: this repo."
  );
  yield* runSkills(root, scope);

  yield* ensureStateRootGitignore(root);

  yield* Console.log("");
  yield* Console.log(
    "Done. Run `/docent` in your agent session to generate a walkthrough."
  );
  yield* Console.log("Re-run `docent install` any time to update the skills.");
});
