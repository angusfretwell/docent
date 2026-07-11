/**
 * A small, pure `.gitignore` matcher used only to keep the repo-rooted
 * working-tree watch (watch.ts) from drowning in ignored churn like
 * `node_modules/` and `dist/` (architecture.md §2). It is deliberately a **perf
 * guard, not the source of truth**: what the Pending diff actually shows comes
 * from git itself (`git status`/`git diff` already honor `.gitignore` fully), so
 * an unmatched pattern here only means the watch may fire a little more often —
 * never that an ignored file leaks into the preview.
 *
 * Supported: blank/`#`-comment lines, bare-name patterns (match in any
 * directory), `*.ext` suffix globs, trailing-slash directory patterns,
 * leading-slash / embedded-slash anchored patterns, and `*`/`?` wildcards
 * within a path segment. Not supported (fall through to git's authority):
 * `!` negations and `**` cross-segment globs. `.git/` and the `.docent/` state
 * root are always ignored — `.docent/` no longer lives in `.gitignore`
 * (data-model.md §1), and its own recursive watch owns it.
 */

const ALWAYS_IGNORED = new Set([".git", ".docent"]);

export interface IgnoreMatcher {
  /** Whether `relPath` (repo-relative, any OS separator) is ignored. */
  readonly ignores: (relPath: string) => boolean;
}

/** Parse gitignore text into the supported pattern lines (see module note). */
export function parseGitignore(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) => line !== "" && !line.startsWith("#") && !line.startsWith("!")
    );
}

/** Escape a literal for use inside a RegExp, leaving glob handling to the caller. */
function escapeLiteral(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convert one path segment's glob to a regex source: `*`→`[^/]*`, `?`→`[^/]`. */
function segmentSource(segment: string): string {
  let source = "";
  for (const char of segment) {
    if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeLiteral(char);
    }
  }
  return source;
}

type Rule = (relPath: string, segments: readonly string[]) => boolean;

function compile(pattern: string): Rule {
  const dirOnly = pattern.endsWith("/");
  const body = (dirOnly ? pattern.slice(0, -1) : pattern).replace(/^\//, "");
  const anchored = pattern.startsWith("/") || body.includes("/");

  if (anchored) {
    // Match from the repo root: the pattern's path prefix, then a segment
    // boundary (a nested file) or the end (the file/dir itself).
    const source = body.split("/").map(segmentSource).join("/");
    const regex = new RegExp(`^${source}(?:/|$)`);
    return (relPath) => regex.test(relPath);
  }

  // A bare name matches that segment anywhere in the path.
  const regex = new RegExp(`^${segmentSource(body)}$`);
  return (_relPath, segments) =>
    segments.some((segment) => regex.test(segment));
}

/** Build a matcher from parsed gitignore patterns. */
export function makeMatcher(patterns: readonly string[]): IgnoreMatcher {
  const rules = patterns.map(compile);
  return {
    ignores(relPath) {
      // Normalize OS-native separators; node:fs.watch reports either.
      const normalized = relPath.replaceAll("\\", "/");
      const segments = normalized
        .split("/")
        .filter((segment) => segment !== "");
      if (segments.some((segment) => ALWAYS_IGNORED.has(segment))) {
        return true;
      }
      return rules.some((rule) => rule(normalized, segments));
    },
  };
}
