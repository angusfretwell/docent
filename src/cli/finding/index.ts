/**
 * The `docent finding` command tree — the non-`serve` face of the binary, and
 * the CLI half of the review loop's two I/O primitives: `list` reads the queue
 * (`./list`), and `add / reply / action / resolve / reopen / edit` append one
 * record each (`./write`). This file is only the argv surface: which flags each
 * subcommand takes and what its JSON result looks like.
 *
 * The CLI is non-gating: it writes the identical file an agent could
 * hand-author, and a running `docent serve` turns that file drop into an SSE
 * refresh via the `.docent/` watch.
 */

import { findingStatuses } from "@shared/enums/finding-status";
import { FindingId } from "@shared/schemas/ids";
import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { parseRecordId } from "../specs";
import {
  commaSeparated,
  parseEnum,
  printJson,
  refuseArguments,
  requireText,
  resolveBody,
  WorkingDirectory,
} from "../usage";
import { listFindings } from "./list";
import type { AuthorOpts } from "./write";
import {
  actionFinding,
  addFinding,
  editFinding,
  parseAnchorSpec,
  reopenFinding,
  replyFinding,
  resolveFinding,
} from "./write";

// The attribution overrides every write subcommand accepts. Attribution is
// metadata, never permission (data-model.md §5.4).
const authorFlags = {
  agent: Flag.string("agent").pipe(
    Flag.optional,
    Flag.withDescription("Attribute to an agent with this slug")
  ),
  display: Flag.string("display").pipe(
    Flag.optional,
    Flag.withDescription("Override the author's display name")
  ),
  model: Flag.string("model").pipe(
    Flag.optional,
    Flag.withDescription("Agent model metadata")
  ),
};

type AuthorFlagValues = Command.Command.Config.Infer<typeof authorFlags>;

function authorOpts(flags: AuthorFlagValues): AuthorOpts {
  return {
    agent: Option.getOrUndefined(flags.agent),
    display: Option.getOrUndefined(flags.display),
    model: Option.getOrUndefined(flags.model),
  };
}

const bodyFlag = Flag.string("body").pipe(
  Flag.optional,
  Flag.withDescription("The record's body (omit to read it from piped stdin)")
);

const findingFlag = Flag.string("finding").pipe(
  Flag.withDescription("The fnd_ id to append to")
);

const list = Command.make(
  "list",
  {
    anchorFile: Flag.string("anchor-file").pipe(
      Flag.optional,
      Flag.withDescription("Keep only findings anchored on this file")
    ),
    args: Argument.string("arg").pipe(
      Argument.variadic(),
      Argument.withDescription("Not accepted — every filter is a flag")
    ),
    author: Flag.string("author").pipe(
      Flag.optional,
      Flag.withDescription("Keep only findings this author id participated in")
    ),
    status: commaSeparated(
      Flag.string("status").pipe(
        Flag.withDescription(
          "Keep only these statuses — repeatable or comma-joined"
        )
      )
    ),
  },
  (config) =>
    Effect.gen(function* runList() {
      const cwd = yield* WorkingDirectory;
      yield* refuseArguments(config.args);
      const status = yield* Effect.all(
        config.status.map((value) =>
          parseEnum("status", value, findingStatuses)
        )
      );

      const findings = yield* listFindings(cwd, {
        anchorFile: Option.getOrUndefined(config.anchorFile),
        author: Option.getOrUndefined(config.author),
        status,
      });

      return yield* printJson({ findings });
    })
).pipe(Command.withDescription("Read the Finding queue, filtered"));

const add = Command.make(
  "add",
  {
    anchor: Flag.string("anchor").pipe(
      Flag.optional,
      Flag.withDescription("A raw anchor arm as JSON — the escape hatch")
    ),
    author: authorFlags,
    body: bodyFlag,
    change: Flag.boolean("change").pipe(
      Flag.withDescription("Anchor on the whole Change")
    ),
    file: Flag.string("file").pipe(
      Flag.optional,
      Flag.withDescription("Anchor on this file")
    ),
    line: Flag.string("line").pipe(
      Flag.optional,
      Flag.withDescription("Narrow --file to a line span: N, N:M, or N-M")
    ),
    side: Flag.string("side").pipe(
      Flag.optional,
      Flag.withDescription("Which side of the Change: base or head")
    ),
  },
  (config) =>
    Effect.gen(function* runAdd() {
      const cwd = yield* WorkingDirectory;
      const anchor = yield* parseAnchorSpec({
        anchor: Option.getOrUndefined(config.anchor),
        change: config.change,
        file: Option.getOrUndefined(config.file),
        line: Option.getOrUndefined(config.line),
        side: Option.getOrUndefined(config.side),
      });
      const body = yield* resolveBody(config.body, true);

      return yield* printJson(
        yield* addFinding(cwd, {
          anchor,
          author: authorOpts(config.author),
          body,
        })
      );
    })
).pipe(Command.withDescription("Mint an anchored Finding"));

const reply = Command.make(
  "reply",
  { author: authorFlags, body: bodyFlag, finding: findingFlag },
  (config) =>
    Effect.gen(function* runReply() {
      const cwd = yield* WorkingDirectory;
      const findingId = yield* parseRecordId(
        "finding",
        FindingId,
        config.finding
      );
      const body = yield* resolveBody(config.body, true);

      return yield* printJson(
        yield* replyFinding(cwd, {
          author: authorOpts(config.author),
          body,
          findingId,
        })
      );
    })
).pipe(
  Command.withDescription("Write prose on a Finding, returning it to open")
);

const action = Command.make(
  "action",
  { author: authorFlags, finding: findingFlag },
  (config) =>
    Effect.gen(function* runAction() {
      const cwd = yield* WorkingDirectory;
      const findingId = yield* parseRecordId(
        "finding",
        FindingId,
        config.finding
      );

      return yield* printJson(
        yield* actionFinding(cwd, {
          author: authorOpts(config.author),
          findingId,
        })
      );
    })
).pipe(Command.withDescription("Hand the turn back on a Finding"));

const resolve = Command.make(
  "resolve",
  { author: authorFlags, finding: findingFlag },
  (config) =>
    Effect.gen(function* runResolve() {
      const cwd = yield* WorkingDirectory;
      const findingId = yield* parseRecordId(
        "finding",
        FindingId,
        config.finding
      );

      return yield* printJson(
        yield* resolveFinding(cwd, {
          author: authorOpts(config.author),
          findingId,
        })
      );
    })
).pipe(Command.withDescription("Close a Finding"));

const reopen = Command.make(
  "reopen",
  { author: authorFlags, finding: findingFlag },
  (config) =>
    Effect.gen(function* runReopen() {
      const cwd = yield* WorkingDirectory;
      const findingId = yield* parseRecordId(
        "finding",
        FindingId,
        config.finding
      );

      return yield* printJson(
        yield* reopenFinding(cwd, {
          author: authorOpts(config.author),
          findingId,
        })
      );
    })
).pipe(Command.withDescription("Return a resolved Finding to open"));

const edit = Command.make(
  "edit",
  {
    author: authorFlags,
    body: bodyFlag,
    finding: findingFlag,
    record: Flag.string("record").pipe(
      Flag.withDescription("The record filename whose body is superseded")
    ),
  },
  (config) =>
    Effect.gen(function* runEdit() {
      const cwd = yield* WorkingDirectory;
      const findingId = yield* parseRecordId(
        "finding",
        FindingId,
        config.finding
      );
      const edits = yield* requireText("record", config.record);
      const body = yield* resolveBody(config.body, true);

      return yield* printJson(
        yield* editFinding(cwd, {
          author: authorOpts(config.author),
          body,
          edits,
          findingId,
        })
      );
    })
).pipe(Command.withDescription("Supersede an earlier record's body"));

/** The `docent finding` subcommand tree — fetch-findings plus write-findings. */
export const findingCommand = Command.make("finding").pipe(
  Command.withDescription("Read and write the Review's Findings"),
  Command.withSubcommands([list, add, reply, action, resolve, reopen, edit])
);
