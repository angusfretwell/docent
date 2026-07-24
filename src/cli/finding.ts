/**
 * The `docent finding` subcommands — the non-`serve` face of the binary, and
 * the CLI half of the review loop's two I/O primitives:
 *
 * - **fetch-findings** → `docent finding list --status …`: walks the active
 *   Review, folds each Finding, and filters the queue on status (+ anchor /
 *   author scope), emitting machine-readable JSON.
 * - **write-findings** → `docent finding add / reply / action / resolve /
 *   reopen / edit`: appends the same validated `docent/finding` records as
 *   `POST /api/findings`, through the *same* `writeFindingRecord`
 *   implementation — no divergence. Anchor construction (resolving a code arm's
 *   content-addressed `blobSha` from git) is operation logic, so it lives in
 *   core (`core/git/anchor`); this file only parses the flags into an
 *   `AnchorSpec`.
 *
 * The CLI is non-gating: it writes the identical file an agent could
 * hand-author, and a running `docent serve` turns that file drop into an SSE
 * refresh via the `.docent/` watch. Parsing and filtering are pure (unit-tested
 * directly); the effectful compute layer resolves git + fs.
 */

import { findingStatuses } from "@shared/enums/finding-status";
import type { FindingStatus } from "@shared/enums/finding-status";
import { sides } from "@shared/enums/side";
import type { Side } from "@shared/enums/side";
import { foldFinding, sortFoldedFindings } from "@shared/lib/finding";
import type { FoldedFinding } from "@shared/lib/finding";
import { Anchor } from "@shared/schemas/finding";
import { FindingWrite } from "@shared/schemas/finding-write";
import { Effect, Schema } from "effect";

import type { AuthorInput } from "../core/findings-write";
import { writeFindingRecord } from "../core/findings-write";
import type { AnchorSpec } from "../core/git";
import {
  buildAnchor,
  resolveAuthor,
  resolveChangeRefs,
  resolveRepo,
} from "../core/git";
import { readReviewSnapshot } from "../core/review";
import {
  attempt,
  CliUsageError,
  many,
  one,
  parseArgs,
  parseEnum,
  printJson,
  requireFlag,
  resolveBody,
} from "./args";
import type { ParsedArgs } from "./args";

// ── list — fetch-findings ────────────────────────────────────────────────────

/** The queue filter: status × scope. */
export interface FindingFilter {
  /** Keep only Findings in these statuses (any-of); empty keeps all. */
  status: readonly FindingStatus[];
  /** Keep only findings anchored on this file (the `line`/`file` code arms). */
  anchorFile?: string;
  /** Keep only findings this author id participated in. */
  author?: string;
}

/** Parse `finding list` flags into a queue filter, rejecting bad enum values. */
export function parseListArgs(args: readonly string[]): FindingFilter {
  const parsed = parseArgs(args, new Set());

  const status = many(parsed, "status").map((value) =>
    parseEnum("status", value, findingStatuses)
  );

  return {
    anchorFile: one(parsed, "anchor-file"),
    author: one(parsed, "author"),
    status,
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
  filter: FindingFilter
): FoldedFinding[] {
  const status = new Set(filter.status);
  return findings.filter((finding) => {
    if (status.size > 0 && !status.has(finding.status)) {
      return false;
    }
    if (
      filter.anchorFile !== undefined &&
      anchorFileOf(finding) !== filter.anchorFile
    ) {
      return false;
    }
    if (
      filter.author !== undefined &&
      !finding.participants.some(
        (participant) => participant.id === filter.author
      )
    ) {
      return false;
    }
    return true;
  });
}

/**
 * fetch-findings: walk the active Review, fold every Finding, filter the queue,
 * and return it in reading order. The identical fold the Findings panel renders
 * (`foldFinding`) — one derivation of status / participants.
 */
export const listFindings = Effect.fn("listFindings")(function* listFindings(
  cwd: string,
  filter: FindingFilter
) {
  const repo = yield* resolveRepo(cwd);
  const snapshot = yield* readReviewSnapshot({
    base: repo.defaultBranch.name,
    branch: repo.branch,
    root: repo.root,
  });
  const folded = snapshot.findings.map((entry) =>
    foldFinding(entry.id, entry.records)
  );
  return sortFoldedFindings(applyFindingFilter(folded, filter));
});

// ── add / reply / action / resolve / reopen / edit — write-findings ──────────

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
  return value === undefined ? "head" : parseEnum("side", value, sides);
}

// A line spec is `N`, `N:M`, or `N-M` (1-based, inclusive) — a single line
// widens to `[N, N]`. Anything else is a usage error.
const LINE_SPEC = /^(?<start>\d+)(?:[:-](?<end>\d+))?$/;

function parseLine(value: string): [number, number] {
  const match = LINE_SPEC.exec(value.trim());
  if (match?.groups === undefined) {
    throw new CliUsageError({
      reason: `bad --line: ${value} (N, N:M, or N-M)`,
    });
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
export function parseAnchorSpec(
  args: ParsedArgs
): Effect.Effect<AnchorSpec, CliUsageError> {
  return Effect.gen(function* build() {
    const raw = one(args, "anchor");
    if (raw !== undefined) {
      const json = yield* Effect.try({
        catch: () =>
          new CliUsageError({ reason: `--anchor is not valid JSON: ${raw}` }),
        try: () => JSON.parse(raw) as unknown,
      });
      const anchor = yield* Schema.decodeUnknownEffect(Anchor)(json).pipe(
        Effect.mapError(
          (error) => new CliUsageError({ reason: `invalid --anchor: ${error}` })
        )
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
          reason:
            "an anchor is required: pass --change, --file <path>, or --anchor <json>",
        })
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
  return {
    agent: one(args, "agent"),
    display: one(args, "display"),
    model: one(args, "model"),
  };
}

/**
 * Resolve the write's attribution: the git-config human by default (matching
 * the UI's write path), or an agent when `--agent <slug>` is given — attribution
 * is metadata, never permission (data-model.md §5.4).
 */
export const buildAuthor = Effect.fn("buildAuthor")(function* buildAuthor(
  root: string,
  opts: AuthorOpts
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
  return {
    ...human,
    ...(opts.display === undefined ? {} : { display: opts.display }),
  };
});

/** The resolved refs a write mints against, plus the read scope for a write. */
interface WriteContext {
  base: string;
  branch: string;
  refs: { baseRef: string; baseSha: string; headRef: string; headSha: string };
  root: string;
}

export const writeContext = Effect.fn("writeContext")(function* writeContext(
  cwd: string
) {
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
  // The encoded (unbranded) shape: the subcommands assemble drafts from raw
  // `--finding`/`--body` flags, and this decode is where the ids get branded.
  draft: typeof FindingWrite.Encoded
) {
  const write = yield* Schema.decodeUnknownEffect(FindingWrite)(draft).pipe(
    Effect.mapError(
      (error) =>
        new CliUsageError({ reason: `invalid finding write: ${error}` })
    )
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
  params: { anchor: AnchorSpec; author: AuthorOpts; body: string }
) {
  const context = yield* writeContext(cwd);
  const author = yield* buildAuthor(context.root, params.author);
  const anchor = yield* buildAnchor({
    baseSha: context.refs.baseSha,
    headSha: context.refs.headSha,
    root: context.root,
    spec: params.anchor,
  });
  return yield* commitWrite(context, author, {
    anchor,
    body: params.body,
    op: "open",
  });
});

/** write-findings `reply`: prose on a Finding, returning it to open. */
export const replyFinding = Effect.fn("replyFinding")(function* replyFinding(
  cwd: string,
  params: { author: AuthorOpts; body: string; findingId: string }
) {
  const context = yield* writeContext(cwd);
  const author = yield* buildAuthor(context.root, params.author);
  return yield* commitWrite(context, author, {
    body: params.body,
    findingId: params.findingId,
    op: "reply",
  });
});

/** write-findings `action`: hand the turn back, whatever the outcome. */
export const actionFinding = Effect.fn("actionFinding")(function* actionFinding(
  cwd: string,
  params: { author: AuthorOpts; findingId: string }
) {
  const context = yield* writeContext(cwd);
  const author = yield* buildAuthor(context.root, params.author);
  return yield* commitWrite(context, author, {
    findingId: params.findingId,
    op: "action",
  });
});

/** write-findings `resolve`: close a Finding. */
export const resolveFinding = Effect.fn("resolveFinding")(
  function* resolveFinding(
    cwd: string,
    params: { author: AuthorOpts; findingId: string }
  ) {
    const context = yield* writeContext(cwd);
    const author = yield* buildAuthor(context.root, params.author);
    return yield* commitWrite(context, author, {
      findingId: params.findingId,
      op: "resolve",
    });
  }
);

/** write-findings `reopen`: return a resolved Finding to open. */
export const reopenFinding = Effect.fn("reopenFinding")(function* reopenFinding(
  cwd: string,
  params: { author: AuthorOpts; findingId: string }
) {
  const context = yield* writeContext(cwd);
  const author = yield* buildAuthor(context.root, params.author);
  return yield* commitWrite(context, author, {
    findingId: params.findingId,
    op: "reopen",
  });
});

/** write-findings `edit`: supersede the body of a named earlier record. */
export const editFinding = Effect.fn("editFinding")(function* editFinding(
  cwd: string,
  params: { author: AuthorOpts; body: string; edits: string; findingId: string }
) {
  const context = yield* writeContext(cwd);
  const author = yield* buildAuthor(context.root, params.author);
  return yield* commitWrite(context, author, {
    body: params.body,
    edits: params.edits,
    findingId: params.findingId,
    op: "edit",
  });
});

// ── argv dispatch ────────────────────────────────────────────────────────────

/**
 * Run one `docent finding <op> …` invocation: parse, execute against git + fs,
 * and print the result as JSON (a `list` array, or the write's `{ changeId,
 * findingId, record }`). Machine-readable so an agent can consume it directly.
 */
export const runFinding = Effect.fn("runFinding")(function* runFinding(
  cwd: string,
  argv: readonly string[]
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
      yield* addFinding(cwd, { anchor, author: parseAuthorOpts(args), body })
    );
  }
  if (op === "reply") {
    const args = yield* attempt(() => parseArgs(rest, new Set()));
    const findingId = yield* attempt(() => requireFlag(args, "finding"));
    const body = yield* resolveBody(args, true);
    return yield* printJson(
      yield* replyFinding(cwd, {
        author: parseAuthorOpts(args),
        body,
        findingId,
      })
    );
  }
  if (op === "action") {
    const args = yield* attempt(() => parseArgs(rest, new Set()));
    const findingId = yield* attempt(() => requireFlag(args, "finding"));
    return yield* printJson(
      yield* actionFinding(cwd, { author: parseAuthorOpts(args), findingId })
    );
  }
  if (op === "resolve") {
    const args = yield* attempt(() => parseArgs(rest, new Set()));
    const findingId = yield* attempt(() => requireFlag(args, "finding"));
    return yield* printJson(
      yield* resolveFinding(cwd, { author: parseAuthorOpts(args), findingId })
    );
  }
  if (op === "reopen") {
    const args = yield* attempt(() => parseArgs(rest, new Set()));
    const findingId = yield* attempt(() => requireFlag(args, "finding"));
    return yield* printJson(
      yield* reopenFinding(cwd, { author: parseAuthorOpts(args), findingId })
    );
  }
  if (op === "edit") {
    const args = yield* attempt(() => parseArgs(rest, new Set()));
    const findingId = yield* attempt(() => requireFlag(args, "finding"));
    const edits = yield* attempt(() => requireFlag(args, "record"));
    const body = yield* resolveBody(args, true);
    return yield* printJson(
      yield* editFinding(cwd, {
        author: parseAuthorOpts(args),
        body,
        edits,
        findingId,
      })
    );
  }

  return yield* Effect.fail(
    new CliUsageError({
      reason: `unknown finding subcommand: ${op ?? "(none)"} (list | add | reply | action | resolve | reopen | edit)`,
    })
  );
});
