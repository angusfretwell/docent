#!/usr/bin/env bun
/**
 * Materialize the dev fixture repo: delete and deterministically rebuild a real
 * git repo at the gitignored `.dev/fixture/` from the checked-in source under
 * `fixtures/`, so that pointing `docent serve` at it shows a rich review — a
 * diff with a Pending section, a Findings queue spanning the full state matrix
 * with drift badges, and a stale code walkthrough with the Change history lit up.
 *
 * The toy app's three snapshot trees (`fixtures/repo/{base,change-1,change-2}`)
 * are committed in order with a pinned author/committer identity and dates, so
 * the resulting commit SHAs — and every `{{sha …}}` / `{{blob …}}` token the
 * `.docent/` records under `fixtures/docent/` are templated with — are
 * byte-stable across machines and runs. A final uncommitted edit leaves the
 * working tree dirty so the Pending view renders.
 *
 *   bun run fixture
 */

import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..");
const sourceRoot = path.join(repoRoot, "fixtures");
const treesRoot = path.join(sourceRoot, "repo");
const docentSource = path.join(sourceRoot, "docent");
const target = path.join(repoRoot, ".dev", "fixture");

const BRANCH = "feat/panel";

// Pinned attribution: an identical author and committer across every commit, so
// the commit SHAs (and the tokens resolved from them) never depend on who runs
// the generator or when.
const IDENTITY = {
  email: "fixture@docent.dev",
  name: "docent fixture",
} as const;

/** One committed snapshot: its source tree, pinned date, message, and — for the
 * first commit off `main` — the feature branch it opens. */
interface Snapshot {
  branch?: string;
  date: string;
  /** Directory under `fixtures/repo/`, also the token ref key (`base`, …). */
  dir: string;
  message: string;
  ref: string;
}

const SNAPSHOTS: readonly Snapshot[] = [
  {
    date: "2026-07-10T01:00:00Z",
    dir: "base",
    message: "Palette: initial static toy",
    ref: "base",
  },
  {
    branch: BRANCH,
    date: "2026-07-10T02:00:00Z",
    dir: "change-1",
    message: "Palette: random color generation",
    ref: "change1",
  },
  {
    date: "2026-07-10T03:00:00Z",
    dir: "change-2",
    message: "Palette: swatch count and history",
    ref: "change2",
  },
];

/**
 * Run a git command in `cwd`, throwing on a non-zero exit and succeeding with
 * trimmed stdout — the `git()` helper pattern from the server test fixtures
 * (src/server/lib/test-fixtures.ts), extended with an optional `env` overlay so
 * a commit can pin its author/committer identity and dates.
 */
function git(
  cwd: string,
  args: readonly string[],
  env?: Record<string, string>
): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    env: env === undefined ? undefined : { ...process.env, ...env },
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr.toString()}${result.stdout.toString()}`
    );
  }
  return result.stdout.toString().trim();
}

/** The author + committer environment that pins a commit's identity and date. */
function commitEnv(date: string): Record<string, string> {
  return {
    GIT_AUTHOR_DATE: date,
    GIT_AUTHOR_EMAIL: IDENTITY.email,
    GIT_AUTHOR_NAME: IDENTITY.name,
    GIT_COMMITTER_DATE: date,
    GIT_COMMITTER_EMAIL: IDENTITY.email,
    GIT_COMMITTER_NAME: IDENTITY.name,
  };
}

/** Empty the worktree of everything but `.git`, so the next snapshot is exact. */
function clearWorktree(dir: string): void {
  for (const entry of readdirSync(dir)) {
    if (entry !== ".git") {
      rmSync(path.join(dir, entry), { force: true, recursive: true });
    }
  }
}

/** Commit one snapshot tree (opening its branch first), returning the new SHA. */
function commitSnapshot(snapshot: Snapshot): string {
  if (snapshot.branch !== undefined) {
    git(target, ["checkout", "-b", snapshot.branch]);
  }
  clearWorktree(target);
  cpSync(path.join(treesRoot, snapshot.dir), target, { recursive: true });
  git(target, ["add", "-A"]);
  git(target, ["commit", "-m", snapshot.message], commitEnv(snapshot.date));
  return git(target, ["rev-parse", "HEAD"]);
}

const TOKEN = /\{\{\s*(?<kind>sha|blob)\s+(?<rest>[^}]+?)\s*\}\}/g;

/** Resolve every `{{sha ref}}` / `{{blob ref path}}` token against the commits. */
function resolveTemplate(
  text: string,
  refs: ReadonlyMap<string, string>
): string {
  return text.replace(TOKEN, (_match, kind: string, rest: string) => {
    const parts = rest.trim().split(/\s+/);
    const sha = refs.get(parts[0] ?? "");
    if (sha === undefined) {
      throw new Error(`unknown fixture ref in token: ${rest}`);
    }
    if (kind === "sha") {
      return sha;
    }
    return git(target, ["rev-parse", `${sha}:${parts.slice(1).join(" ")}`]);
  });
}

/** Copy `fixtures/docent/` into the repo's `.docent/`, resolving tokens en route. */
function materializeDocent(refs: ReadonlyMap<string, string>): void {
  const entries = readdirSync(docentSource, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const absolute = path.join(entry.parentPath, entry.name);
    const destination = path.join(
      target,
      ".docent",
      path.relative(docentSource, absolute)
    );
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      resolveTemplate(readFileSync(absolute, "utf-8"), refs)
    );
  }
}

/** Append an uncommitted edit so the working tree is dirty and Pending renders. */
function leavePendingEdit(): void {
  const stylesPath = path.join(target, "styles.css");
  const rule = "\nbutton {\n  margin-top: 1rem;\n}\n";
  writeFileSync(stylesPath, `${readFileSync(stylesPath, "utf-8")}${rule}`);
}

rmSync(target, { force: true, recursive: true });
mkdirSync(target, { recursive: true });
git(target, ["init", "-b", "main"]);
git(target, ["config", "user.email", IDENTITY.email]);
git(target, ["config", "user.name", IDENTITY.name]);

const refs = new Map<string, string>();
for (const snapshot of SNAPSHOTS) {
  refs.set(snapshot.ref, commitSnapshot(snapshot));
}

materializeDocent(refs);
leavePendingEdit();

console.log(
  `materialized fixture → ${path.relative(repoRoot, target)} (${BRANCH} @ ${refs.get("change2")?.slice(0, 7)}, base @ ${refs.get("base")?.slice(0, 7)})`
);
