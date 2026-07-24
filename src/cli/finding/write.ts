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

export interface AuthorOpts {
  agent?: string;
  display?: string;
  model?: string;
}

export interface AnchorFlags {
  anchor?: string;
  change: boolean;
  file?: string;
  line?: string;
  side?: string;
}

function parseSide(
  value: string | undefined
): Effect.Effect<Side, CliUsageError> {
  return value === undefined
    ? Effect.succeed<Side>("head")
    : parseEnum("side", value, sides);
}

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

type WriteScope = Effect.Success<ReturnType<typeof resolveChangeScope>>;

const commitWrite = Effect.fn("commitWrite")(function* commitWrite(
  scope: WriteScope,
  author: Author,
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
