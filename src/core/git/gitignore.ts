/**
 * Perf guard, not the source of truth: keeps the working-tree watch
 * (serve/watch.ts) from drowning in ignored churn. git is authoritative for the
 * Pending diff, so an unmatched pattern here only means the watch fires more
 * often, never that an ignored file leaks. `!` negations and `**` globs are
 * unsupported and fall through to git.
 */

const ALWAYS_IGNORED = new Set([".git", ".docent"]);

export interface IgnoreMatcher {
  readonly ignores: (relPath: string) => boolean;
}

export function parseGitignore(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) => line !== "" && !line.startsWith("#") && !line.startsWith("!")
    );
}

function escapeLiteral(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    const source = body.split("/").map(segmentSource).join("/");
    const regex = new RegExp(`^${source}(?:/|$)`);
    return (relPath) => regex.test(relPath);
  }

  const regex = new RegExp(`^${segmentSource(body)}$`);
  return (_relPath, segments) =>
    segments.some((segment) => regex.test(segment));
}

export function makeMatcher(patterns: readonly string[]): IgnoreMatcher {
  const rules = patterns.map(compile);
  return {
    ignores(relPath) {
      // node:fs.watch reports either OS separator.
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
