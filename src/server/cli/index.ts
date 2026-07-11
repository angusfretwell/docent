/**
 * The `docent finding` subcommands — the non-`serve` face of the binary, and
 * the CLI half of the review loop's two I/O primitives (agent-integration.md
 * §2.2, §3.3):
 *
 * - **fetch-findings** → `docent finding list --filter …`: walks the active
 *   Dossier, folds each Finding, and filters the queue on open/resolved +
 *   what's-next (+ anchor / author scope), emitting machine-readable JSON.
 * - **write-findings** → `docent finding add / reply / resolve`: appends the
 *   same validated `docent/finding@3` records as `POST /api/findings`, through
 *   the *same* `writeFindingRecord` implementation — no divergence. Anchor
 *   construction (resolving a code arm's content-addressed `blobSha` from git)
 *   lives here so the CLI is the single home for it.
 *
 * The CLI is non-gating (architecture.md §3): it writes the identical file an
 * agent could hand-author, and a running `docent serve` turns that file drop
 * into an SSE refresh via the `.docent/` watch. Parsing and filtering are pure
 * (unit-tested directly); the effectful compute layer resolves git + fs.
 */

import { Console, Effect, Schema } from "effect";
import { foldFinding, sortFoldedFindings } from "@shared/lib/finding";
import type { FoldedFinding, WhatsNext } from "@shared/lib/finding";
import { Anchor } from "@shared/schemas/finding";
import type { Disposition } from "@shared/schemas/finding";
import { FindingWrite } from "@shared/schemas/finding-write";
import { readDossierSnapshot } from "../services/dossier";
import type { AuthorInput } from "../services/findings-write";
import { writeFindingRecord } from "../services/findings-write";
import { resolveAuthor, resolveBlobShaAt, resolveChangeRefs, resolveRepo } from "../services/git";

/** A CLI usage error — a bad flag, missing anchor, or unknown subcommand. */
export class CliUsageError extends Schema.TaggedErrorClass<CliUsageError>()("CliUsageError", {
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason;
  }
}

/**
 * Run a throwing synchronous parser as a typed `CliUsageError` failure. The
 * parsers throw for readable, colocated validation; this converts the throw into
 * an Effect failure so it never escapes an `Effect.fn` generator as a defect.
 */
export function attempt<A>(parse: () => A): Effect.Effect<A, CliUsageError> {
  return Effect.try({
    catch: (error) =>
      error instanceof CliUsageError ? error : new CliUsageError({ reason: String(error) }),
    try: parse,
  });
}

const SIDES = ["base", "head"] as const;
type Side = (typeof SIDES)[number];

const WHATS_NEXT_VALUES: readonly WhatsNext[] = [
  "needs-action",
  "needs-verify",
  "needs-answer",
  "needs-decision",
  "closed",
];
const DISPOSITION_VALUES: readonly Disposition[] = ["actioned", "declined", "question"];

/**
 * Assert a flag value is one of a closed set, or throw a usage error naming the
 * allowed values — the one shape shared by `--side`, `--disposition`, and
 * `--whats-next`. The sets are tiny (2–5 members), so a linear membership check
 * is fine.
 */
export function parseEnum<T extends string>(flag: string, value: string, values: readonly T[]): T {
  if (!values.includes(value as T)) {
    throw new CliUsageError({
      reason: `unknown --${flag}: ${value} (one of ${values.join(", ")})`,
    });
  }
  return value as T;
}

// A parsed argv: repeated `--flag value` / `--flag=value` accumulate under the
// key; a valueless `--flag` (at the end or before another `--flag`) is a bool.
export interface ParsedArgs {
  values: Map<string, string[]>;
  bools: Set<string>;
}

/** Append `value` under `key`, starting the list if this is the first. */
function push(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, [value]);
  } else {
    existing.push(value);
  }
}

/**
 * Split `--flag value` / `--flag=value` / bare `--flag` argv into a flag map.
 * `booleans` names the valueless flags so they never swallow a following token;
 * every other `--flag` takes the next non-`--` token as its value, and repeats
 * accumulate. A bare token that is not a flag is rejected — the finding
 * subcommands are all-flags, so a stray positional is a usage error.
 */
export function parseArgs(args: readonly string[], booleans: ReadonlySet<string>): ParsedArgs {
  const values = new Map<string, string[]>();
  const bools = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i] ?? "";
    if (!token.startsWith("--")) {
      throw new CliUsageError({ reason: `unexpected argument: ${token}` });
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    const next = args[i + 1];
    if (eq !== -1) {
      push(values, body.slice(0, eq), body.slice(eq + 1));
    } else if (booleans.has(body) || next === undefined || next.startsWith("--")) {
      // A valueless flag not declared boolean is still tolerated as a bool, so a
      // typo surfaces later as "unknown"/"missing" rather than eating a token.
      bools.add(body);
    } else {
      push(values, body, next);
      i += 1;
    }
  }
  return { bools, values };
}

/** The last value given for a flag, or `undefined`. */
export function one(args: ParsedArgs, key: string): string | undefined {
  return args.values.get(key)?.at(-1);
}

/** Every value given for a (repeatable) flag, flattened across `,`-lists. */
export function many(args: ParsedArgs, key: string): string[] {
  const out: string[] = [];
  for (const value of args.values.get(key) ?? []) {
    for (const part of value.split(",")) {
      if (part !== "") {
        out.push(part);
      }
    }
  }
  return out;
}

// ── list — fetch-findings ────────────────────────────────────────────────────

/** The queue filter (agent-integration.md §2.2): status × what's-next × scope. */
export interface FindingFilter {
  /** `open` keeps unresolved, `resolved` keeps resolved, `undefined` keeps all. */
  status?: "open" | "resolved";
  /** Keep only these what's-next states (any-of); empty keeps all. */
  whatsNext: readonly WhatsNext[];
  /** Keep only findings anchored on this file (the `line`/`file` code arms). */
  anchorFile?: string;
  /** Keep only findings this author id participated in. */
  author?: string;
}

/** Parse `finding list` flags into a queue filter, rejecting bad enum values. */
export function parseListArgs(args: readonly string[]): FindingFilter {
  const parsed = parseArgs(args, new Set(["open", "resolved"]));

  // --open and --resolved are complements; asking for both (or neither) keeps
  // all — so a status filter applies only when exactly one is given.
  const wantsOpen = parsed.bools.has("open");
  const wantsResolved = parsed.bools.has("resolved");
  let status: FindingFilter["status"];
  if (wantsOpen !== wantsResolved) {
    status = wantsOpen ? "open" : "resolved";
  }

  const whatsNext = many(parsed, "whats-next").map((value) =>
    parseEnum("whats-next", value, WHATS_NEXT_VALUES),
  );

  return {
    anchorFile: one(parsed, "anchor-file"),
    author: one(parsed, "author"),
    status,
    whatsNext,
  };
}

/** The anchored file of a folded Finding's `line`/`file` code arm, else none. */
function anchorFileOf(finding: FoldedFinding): string | undefined {
  const { anchor } = finding;
  if (anchor?.kind === "line" || anchor?.kind === "file") {
    return anchor.file;
  }
  return undefined;
}

/** Apply a queue filter to folded Findings — pure, so it is unit-tested alone. */
export function applyFindingFilter(
  findings: readonly FoldedFinding[],
  filter: FindingFilter,
): FoldedFinding[] {
  const whatsNext = new Set(filter.whatsNext);
  return findings.filter((finding) => {
    if (filter.status === "open" && finding.resolved) {
      return false;
    }
    if (filter.status === "resolved" && !finding.resolved) {
      return false;
    }
    if (whatsNext.size > 0 && !whatsNext.has(finding.whatsNext)) {
      return false;
    }
    if (filter.anchorFile !== undefined && anchorFileOf(finding) !== filter.anchorFile) {
      return false;
    }
    if (
      filter.author !== undefined &&
      !finding.participants.some((participant) => participant.id === filter.author)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * fetch-findings: walk the active Dossier, fold every Finding, filter the queue,
 * and return it in reading order. The identical fold the Findings panel renders
 * (`foldFinding`) — one derivation of resolved / what's-next / participants.
 */
export const listFindings = Effect.fn("listFindings")(function* listFindings(
  cwd: string,
  filter: FindingFilter,
) {
  const repo = yield* resolveRepo(cwd);
  const snapshot = yield* readDossierSnapshot({
    base: repo.defaultBranch.name,
    branch: repo.branch,
    root: repo.root,
  });
  const folded = snapshot.findings.map((entry) => foldFinding(entry.id, entry.records));
  return sortFoldedFindings(applyFindingFilter(folded, filter));
});

// ── add / reply / resolve — write-findings ───────────────────────────────────

/** How `finding add` names the anchor before git resolves any `blobSha`. */
export type AnchorSpec =
  | { kind: "change" }
  | { file: string; kind: "file"; side: Side }
  | { file: string; kind: "line"; lines: [number, number]; side: Side }
  | { anchor: Anchor; kind: "raw" };

/** The author-attribution overrides shared by every write subcommand. */
export interface AuthorOpts {
  /** Attribute to an agent with this slug (else the git-config human). */
  agent?: string;
  /** Override the display name. */
  display?: string;
  /** Optional agent model metadata. */
  model?: string;
}

function parseSide(value: string | undefined): Side {
  return value === undefined ? "head" : parseEnum("side", value, SIDES);
}

// A line spec is `N`, `N:M`, or `N-M` (1-based, inclusive) — a single line
// widens to `[N, N]`. Anything else is a usage error.
const LINE_SPEC = /^(?<start>\d+)(?:[:-](?<end>\d+))?$/;

function parseLine(value: string): [number, number] {
  const match = LINE_SPEC.exec(value.trim());
  if (match?.groups === undefined) {
    throw new CliUsageError({ reason: `bad --line: ${value} (N, N:M, or N-M)` });
  }
  const start = Number(match.groups.start);
  const end = match.groups.end === undefined ? start : Number(match.groups.end);
  return [start, end];
}

/**
 * Parse a `finding add` anchor from flags. `--anchor <json>` is the escape hatch
 * for any of the seven arms (validated against the schema); the convenience
 * flags cover the code arms whose `blobSha` git resolves at write:
 * `--change`, `--file <path>` (+ `--side`), and `--file … --line N[:M]`.
 */
export function parseAnchorSpec(args: ParsedArgs): Effect.Effect<AnchorSpec, CliUsageError> {
  return Effect.gen(function* build() {
    const raw = one(args, "anchor");
    if (raw !== undefined) {
      const json = yield* Effect.try({
        catch: () => new CliUsageError({ reason: `--anchor is not valid JSON: ${raw}` }),
        try: () => JSON.parse(raw) as unknown,
      });
      const anchor = yield* Schema.decodeUnknownEffect(Anchor)(json).pipe(
        Effect.mapError((error) => new CliUsageError({ reason: `invalid --anchor: ${error}` })),
      );
      return { anchor, kind: "raw" } satisfies AnchorSpec;
    }

    if (args.bools.has("change")) {
      return { kind: "change" } satisfies AnchorSpec;
    }

    const file = one(args, "file");
    if (file === undefined) {
      return yield* Effect.fail(
        new CliUsageError({
          reason: "an anchor is required: pass --change, --file <path>, or --anchor <json>",
        }),
      );
    }
    const side = yield* attempt(() => parseSide(one(args, "side")));
    const line = one(args, "line");
    if (line === undefined) {
      return { file, kind: "file", side } satisfies AnchorSpec;
    }
    const lines = yield* attempt(() => parseLine(line));
    return { file, kind: "line", lines, side } satisfies AnchorSpec;
  });
}

/** Parse the shared `--agent`/`--display`/`--model` attribution overrides. */
function parseAuthorOpts(args: ParsedArgs): AuthorOpts {
  return { agent: one(args, "agent"), display: one(args, "display"), model: one(args, "model") };
}

/**
 * Resolve the write's attribution: the git-config human by default (matching
 * the UI's write path), or an agent when `--agent <slug>` is given — attribution
 * is metadata, never permission (data-model.md §5.4).
 */
export const buildAuthor = Effect.fn("buildAuthor")(function* buildAuthor(
  root: string,
  opts: AuthorOpts,
) {
  if (opts.agent !== undefined) {
    return {
      display: opts.display ?? opts.agent,
      id: opts.agent,
      kind: "agent",
      ...(opts.model === undefined ? {} : { model: opts.model }),
    } satisfies AuthorInput;
  }
  const human = yield* resolveAuthor(root);
  return { ...human, ...(opts.display === undefined ? {} : { display: opts.display }) };
});

/** Turn an `AnchorSpec` into a schema anchor, resolving code-arm `blobSha`s. */
const buildAnchor = Effect.fn("buildAnchor")(function* buildAnchor(params: {
  root: string;
  baseSha: string;
  headSha: string;
  spec: AnchorSpec;
}) {
  const { spec } = params;
  if (spec.kind === "raw") {
    return spec.anchor;
  }
  if (spec.kind === "change") {
    return { kind: "change" } satisfies Anchor;
  }
  const ref = spec.side === "head" ? params.headSha : params.baseSha;
  const blobSha = yield* resolveBlobShaAt(params.root, ref, spec.file);
  if (spec.kind === "file") {
    return { blobSha, file: spec.file, kind: "file", side: spec.side } satisfies Anchor;
  }
  return {
    blobSha,
    file: spec.file,
    kind: "line",
    lines: spec.lines,
    side: spec.side,
  } satisfies Anchor;
});

/** The resolved refs a write mints against, plus the read scope for a write. */
interface WriteContext {
  base: string;
  branch: string;
  refs: { baseRef: string; baseSha: string; headRef: string; headSha: string };
  root: string;
}

export const writeContext = Effect.fn("writeContext")(function* writeContext(cwd: string) {
  const refs = yield* resolveChangeRefs(cwd);
  return {
    base: refs.defaultBranch.name,
    branch: refs.branch,
    refs: {
      baseRef: refs.defaultBranch.name,
      baseSha: refs.baseSha,
      headRef: refs.branch,
      headSha: refs.headSha,
    },
    root: refs.root,
  } satisfies WriteContext;
});

/**
 * The shared write tail for every write subcommand: validate the assembled
 * record against the same `FindingWrite` schema the server decodes `POST
 * /api/findings` bodies with, then append it through the shared
 * `writeFindingRecord`. Both surfaces validate and write identically — one
 * implementation, no divergence (agent-integration.md §3.3).
 */
const commitWrite = Effect.fn("commitWrite")(function* commitWrite(
  context: WriteContext,
  author: AuthorInput,
  draft: FindingWrite,
) {
  const write = yield* Schema.decodeUnknownEffect(FindingWrite)(draft).pipe(
    Effect.mapError((error) => new CliUsageError({ reason: `invalid finding write: ${error}` })),
  );
  return yield* writeFindingRecord({
    author,
    base: context.base,
    branch: context.branch,
    refs: context.refs,
    root: context.root,
    write,
  });
});

/** write-findings `open`: mint an anchored Finding via the shared write path. */
export const addFinding = Effect.fn("addFinding")(function* addFinding(
  cwd: string,
  params: { anchor: AnchorSpec; author: AuthorOpts; body: string },
) {
  const context = yield* writeContext(cwd);
  const author = yield* buildAuthor(context.root, params.author);
  const anchor = yield* buildAnchor({
    baseSha: context.refs.baseSha,
    headSha: context.refs.headSha,
    root: context.root,
    spec: params.anchor,
  });
  return yield* commitWrite(context, author, { anchor, body: params.body, op: "open" });
});

/** write-findings `reply`, optionally closing the turn with a disposition. */
export const replyFinding = Effect.fn("replyFinding")(function* replyFinding(
  cwd: string,
  params: { author: AuthorOpts; body: string; disposition?: Disposition; findingId: string },
) {
  const context = yield* writeContext(cwd);
  const author = yield* buildAuthor(context.root, params.author);
  return yield* commitWrite(context, author, {
    body: params.body,
    findingId: params.findingId,
    op: "reply",
    ...(params.disposition === undefined ? {} : { disposition: params.disposition }),
  });
});

/** write-findings `resolve`, with an optional reason body. */
export const resolveFinding = Effect.fn("resolveFinding")(function* resolveFinding(
  cwd: string,
  params: { author: AuthorOpts; body?: string; findingId: string },
) {
  const context = yield* writeContext(cwd);
  const author = yield* buildAuthor(context.root, params.author);
  return yield* commitWrite(context, author, {
    findingId: params.findingId,
    op: "resolve",
    ...(params.body === undefined ? {} : { body: params.body }),
  });
});

// ── argv dispatch ────────────────────────────────────────────────────────────

/** The last value of a required flag, or a usage error naming it. */
export function requireFlag(args: ParsedArgs, key: string): string {
  const value = one(args, key)?.trim();
  if (value === undefined || value === "") {
    throw new CliUsageError({ reason: `--${key} <value> is required` });
  }
  return value;
}

function parseDisposition(value: string | undefined): Disposition | undefined {
  return value === undefined ? undefined : parseEnum("disposition", value, DISPOSITION_VALUES);
}

/**
 * Resolve a write's body: `--body <text>`, else piped stdin (never a TTY, so a
 * bodyless interactive call fails fast rather than hanging on a read). `required`
 * distinguishes `add`/`reply` (a body is the record) from `resolve` (the body is
 * an optional reason).
 */
export const resolveBody = Effect.fn("resolveBody")(function* resolveBody(
  args: ParsedArgs,
  required: boolean,
) {
  const flag = one(args, "body");
  if (flag !== undefined) {
    return flag;
  }
  const piped = process.stdin.isTTY ? "" : (yield* Effect.promise(() => Bun.stdin.text())).trim();
  if (piped !== "") {
    return piped;
  }
  if (required) {
    return yield* Effect.fail(
      new CliUsageError({ reason: "--body <text> is required (or pipe stdin)" }),
    );
  }
  // No body given and none required: resolve's reason is simply absent ("").
  return "";
});

/** Print a value as pretty JSON on stdout — the machine-readable result shape. */
export function printJson(value: unknown) {
  return Console.log(JSON.stringify(value, null, 2));
}

/**
 * Run one `docent finding <op> …` invocation: parse, execute against git + fs,
 * and print the result as JSON (a `list` array, or the write's `{ changeId,
 * findingId, record }`). Machine-readable so an agent can consume it directly.
 */
export const runFinding = Effect.fn("runFinding")(function* runFinding(
  cwd: string,
  argv: readonly string[],
) {
  const [op, ...rest] = argv;

  if (op === "list") {
    const filter = yield* attempt(() => parseListArgs(rest));
    const findings = yield* listFindings(cwd, filter);
    return yield* printJson({ findings });
  }
  if (op === "add") {
    const args = yield* attempt(() => parseArgs(rest, new Set(["change"])));
    const anchor = yield* parseAnchorSpec(args);
    const body = yield* resolveBody(args, true);
    return yield* printJson(
      yield* addFinding(cwd, { anchor, author: parseAuthorOpts(args), body }),
    );
  }
  if (op === "reply") {
    const args = yield* attempt(() => parseArgs(rest, new Set()));
    const findingId = yield* attempt(() => requireFlag(args, "finding"));
    const disposition = yield* attempt(() => parseDisposition(one(args, "disposition")));
    const body = yield* resolveBody(args, true);
    return yield* printJson(
      yield* replyFinding(cwd, {
        author: parseAuthorOpts(args),
        body,
        findingId,
        ...(disposition === undefined ? {} : { disposition }),
      }),
    );
  }
  if (op === "resolve") {
    const args = yield* attempt(() => parseArgs(rest, new Set()));
    const findingId = yield* attempt(() => requireFlag(args, "finding"));
    const body = yield* resolveBody(args, false);
    return yield* printJson(
      yield* resolveFinding(cwd, {
        author: parseAuthorOpts(args),
        findingId,
        ...(body === "" ? {} : { body }),
      }),
    );
  }

  return yield* Effect.fail(
    new CliUsageError({
      reason: `unknown finding subcommand: ${op ?? "(none)"} (list | add | reply | resolve)`,
    }),
  );
});
