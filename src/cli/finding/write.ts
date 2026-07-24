/**
 * `docent finding add / reply / action / resolve / reopen / edit` — the review
 * loop's **write-findings** primitive. Each runner appends the same validated
 * `docent/finding` record as `POST /api/findings`, through the *same*
 * `writeFindingRecord` implementation — one write path, no divergence
 * (agent-integration.md §3.3).
 *
 * Anchor construction (resolving a code arm's content-addressed `blobSha` from
 * git) is operation logic, so it lives in core (`core/git/anchor`); this file
 * only turns flags into an `AnchorSpec`. The read half of the primitive pair
 * lives in `./list`.
 */

import { writeFindingRecord } from "@core/findings-write";
import type { AnchorSpec } from "@core/git";
import { buildAnchor, resolveAuthor } from "@core/git";
import { resolveChangeScope } from "@core/write-context";
import { sides } from "@shared/enums/side";
import type { Side } from "@shared/enums/side";
import { Anchor, Author } from "@shared/schemas/finding";
import { FindingWrite } from "@shared/schemas/finding-write";
import type { FindingId } from "@shared/schemas/ids";
import { Effect, Schema } from "effect";

import { CliUsageError, parseEnum } from "../usage";

/** The author-attribution overrides shared by every write subcommand. */
export interface AuthorOpts {
  /** Attribute to an agent with this slug (else the git-config human). */
  agent?: string;
  /** Override the display name. */
  display?: string;
  /** Optional agent model metadata. */
  model?: string;
}

/** The anchor flags `finding add` accepts, exactly one arm of which must be given. */
export interface AnchorFlags {
  /** The raw-arm escape hatch: any of the seven arms as JSON. */
  anchor?: string;
  /** The whole-Change arm. */
  change: boolean;
  /** The file arm (widened to a line arm by `line`). */
  file?: string;
  /** A `N`, `N:M`, or `N-M` line spec. */
  line?: string;
  /** Which side of the Change the code arm pins to; defaults to head. */
  side?: string;
}

function parseSide(
  value: string | undefined
): Effect.Effect<Side, CliUsageError> {
  return value === undefined
    ? Effect.succeed<Side>("head")
    : parseEnum("side", value, sides);
}

// A line spec is `N`, `N:M`, or `N-M` (1-based, inclusive) — a single line
// widens to `[N, N]`. Anything else is a usage error.
const LINE_SPEC = /^(?<start>\d+)(?:[:-](?<end>\d+))?$/;

function parseLine(
  value: string
): Effect.Effect<[number, number], CliUsageError> {
  const match = LINE_SPEC.exec(value.trim());
  if (match?.groups === undefined) {
    return Effect.fail(
      new CliUsageError({ reason: `bad --line: ${value} (N, N:M, or N-M)` })
    );
  }

  const start = Number(match.groups.start);
  const end = match.groups.end === undefined ? start : Number(match.groups.end);

  return Effect.succeed([start, end]);
}

/**
 * Parse a `finding add` anchor from its flags. `--anchor <json>` is the escape
 * hatch for any of the seven arms (validated against the schema); the
 * convenience flags cover the code arms whose `blobSha` git resolves at write:
 * `--change`, `--file <path>` (+ `--side`), and `--file … --line N[:M]`.
 */
export const parseAnchorSpec = Effect.fn("parseAnchorSpec")(
  function* parseAnchorSpec(flags: AnchorFlags) {
    const raw = flags.anchor;
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

    if (flags.change) {
      return { kind: "change" } satisfies AnchorSpec;
    }

    const { file, line } = flags;
    if (file === undefined) {
      return yield* Effect.fail(
        new CliUsageError({
          reason:
            "an anchor is required: pass --change, --file <path>, or --anchor <json>",
        })
      );
    }

    const side = yield* parseSide(flags.side);
    if (line === undefined) {
      return { file, kind: "file", side } satisfies AnchorSpec;
    }

    const lines = yield* parseLine(line);

    return { file, kind: "line", lines, side } satisfies AnchorSpec;
  }
);

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
    return Author.make({
      display: opts.display ?? opts.agent,
      id: opts.agent,
      kind: "agent",
      ...(opts.model === undefined ? {} : { model: opts.model }),
    });
  }
  const human = yield* resolveAuthor(root);
  return Author.make({
    display: opts.display ?? human.display,
    id: human.id,
    kind: human.kind,
  });
});

/** The resolved refs a write mints against, plus the read scope for a write. */
type WriteScope = Effect.Success<ReturnType<typeof resolveChangeScope>>;

/**
 * The shared write tail for every write subcommand: validate the assembled
 * record against the same `FindingWrite` schema the server decodes `POST
 * /api/findings` bodies with, then append it through the shared
 * `writeFindingRecord`. Both surfaces validate and write identically — one
 * implementation, no divergence (agent-integration.md §3.3).
 */
const commitWrite = Effect.fn("commitWrite")(function* commitWrite(
  scope: WriteScope,
  author: Author,
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
    base: scope.base,
    branch: scope.branch,
    refs: scope.refs,
    root: scope.root,
    write,
  });
});

/** write-findings `open`: mint an anchored Finding via the shared write path. */
export const addFinding = Effect.fn("addFinding")(function* addFinding(
  cwd: string,
  params: { anchor: AnchorSpec; author: AuthorOpts; body: string }
) {
  const scope = yield* resolveChangeScope(cwd);
  const author = yield* buildAuthor(scope.root, params.author);
  const anchor = yield* buildAnchor({
    baseSha: scope.refs.baseSha,
    headSha: scope.refs.headSha,
    root: scope.root,
    spec: params.anchor,
  });
  return yield* commitWrite(scope, author, {
    anchor,
    body: params.body,
    op: "open",
  });
});

/** write-findings `reply`: prose on a Finding, returning it to open. */
export const replyFinding = Effect.fn("replyFinding")(function* replyFinding(
  cwd: string,
  params: { author: AuthorOpts; body: string; findingId: FindingId }
) {
  const scope = yield* resolveChangeScope(cwd);
  const author = yield* buildAuthor(scope.root, params.author);
  return yield* commitWrite(scope, author, {
    body: params.body,
    findingId: params.findingId,
    op: "reply",
  });
});

/** write-findings `action`: hand the turn back, whatever the outcome. */
export const actionFinding = Effect.fn("actionFinding")(function* actionFinding(
  cwd: string,
  params: { author: AuthorOpts; findingId: FindingId }
) {
  const scope = yield* resolveChangeScope(cwd);
  const author = yield* buildAuthor(scope.root, params.author);
  return yield* commitWrite(scope, author, {
    findingId: params.findingId,
    op: "action",
  });
});

/** write-findings `resolve`: close a Finding. */
export const resolveFinding = Effect.fn("resolveFinding")(
  function* resolveFinding(
    cwd: string,
    params: { author: AuthorOpts; findingId: FindingId }
  ) {
    const scope = yield* resolveChangeScope(cwd);
    const author = yield* buildAuthor(scope.root, params.author);
    return yield* commitWrite(scope, author, {
      findingId: params.findingId,
      op: "resolve",
    });
  }
);

/** write-findings `reopen`: return a resolved Finding to open. */
export const reopenFinding = Effect.fn("reopenFinding")(function* reopenFinding(
  cwd: string,
  params: { author: AuthorOpts; findingId: FindingId }
) {
  const scope = yield* resolveChangeScope(cwd);
  const author = yield* buildAuthor(scope.root, params.author);
  return yield* commitWrite(scope, author, {
    findingId: params.findingId,
    op: "reopen",
  });
});

/** write-findings `edit`: supersede the body of a named earlier record. */
export const editFinding = Effect.fn("editFinding")(function* editFinding(
  cwd: string,
  params: {
    author: AuthorOpts;
    body: string;
    edits: string;
    findingId: FindingId;
  }
) {
  const scope = yield* resolveChangeScope(cwd);
  const author = yield* buildAuthor(scope.root, params.author);
  return yield* commitWrite(scope, author, {
    body: params.body,
    edits: params.edits,
    findingId: params.findingId,
    op: "edit",
  });
});
