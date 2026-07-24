import { commentStatuses } from "@shared/enums/comment-status";
import { CommentId } from "@shared/schemas/ids";
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
import { listComments } from "./list";
import type { AuthorOpts } from "./write";
import {
  actionComment,
  addComment,
  editComment,
  parseAnchorSpec,
  reopenComment,
  replyComment,
  resolveComment,
} from "./write";

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

const commentFlag = Flag.string("comment").pipe(
  Flag.withDescription("The cmt_ id to append to")
);

const list = Command.make(
  "list",
  {
    anchorFile: Flag.string("anchor-file").pipe(
      Flag.optional,
      Flag.withDescription("Keep only comments anchored on this file")
    ),
    args: Argument.string("arg").pipe(
      Argument.variadic(),
      Argument.withDescription("Not accepted — every filter is a flag")
    ),
    author: Flag.string("author").pipe(
      Flag.optional,
      Flag.withDescription("Keep only comments this author id participated in")
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
          parseEnum("status", value, commentStatuses)
        )
      );

      const comments = yield* listComments(cwd, {
        anchorFile: Option.getOrUndefined(config.anchorFile),
        author: Option.getOrUndefined(config.author),
        status,
      });

      return yield* printJson({ comments });
    })
).pipe(Command.withDescription("Read the Comment queue, filtered"));

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
        yield* addComment(cwd, {
          anchor,
          author: authorOpts(config.author),
          body,
        })
      );
    })
).pipe(Command.withDescription("Mint an anchored Comment"));

const reply = Command.make(
  "reply",
  { author: authorFlags, body: bodyFlag, comment: commentFlag },
  (config) =>
    Effect.gen(function* runReply() {
      const cwd = yield* WorkingDirectory;
      const commentId = yield* parseRecordId(
        "comment",
        CommentId,
        config.comment
      );
      const body = yield* resolveBody(config.body, true);

      return yield* printJson(
        yield* replyComment(cwd, {
          author: authorOpts(config.author),
          body,
          commentId,
        })
      );
    })
).pipe(
  Command.withDescription("Write prose on a Comment, returning it to open")
);

const action = Command.make(
  "action",
  { author: authorFlags, comment: commentFlag },
  (config) =>
    Effect.gen(function* runAction() {
      const cwd = yield* WorkingDirectory;
      const commentId = yield* parseRecordId(
        "comment",
        CommentId,
        config.comment
      );

      return yield* printJson(
        yield* actionComment(cwd, {
          author: authorOpts(config.author),
          commentId,
        })
      );
    })
).pipe(Command.withDescription("Hand the turn back on a Comment"));

const resolve = Command.make(
  "resolve",
  { author: authorFlags, comment: commentFlag },
  (config) =>
    Effect.gen(function* runResolve() {
      const cwd = yield* WorkingDirectory;
      const commentId = yield* parseRecordId(
        "comment",
        CommentId,
        config.comment
      );

      return yield* printJson(
        yield* resolveComment(cwd, {
          author: authorOpts(config.author),
          commentId,
        })
      );
    })
).pipe(Command.withDescription("Close a Comment"));

const reopen = Command.make(
  "reopen",
  { author: authorFlags, comment: commentFlag },
  (config) =>
    Effect.gen(function* runReopen() {
      const cwd = yield* WorkingDirectory;
      const commentId = yield* parseRecordId(
        "comment",
        CommentId,
        config.comment
      );

      return yield* printJson(
        yield* reopenComment(cwd, {
          author: authorOpts(config.author),
          commentId,
        })
      );
    })
).pipe(Command.withDescription("Return a resolved Comment to open"));

const edit = Command.make(
  "edit",
  {
    author: authorFlags,
    body: bodyFlag,
    comment: commentFlag,
    record: Flag.string("record").pipe(
      Flag.withDescription("The record filename whose body is superseded")
    ),
  },
  (config) =>
    Effect.gen(function* runEdit() {
      const cwd = yield* WorkingDirectory;
      const commentId = yield* parseRecordId(
        "comment",
        CommentId,
        config.comment
      );
      const edits = yield* requireText("record", config.record);
      const body = yield* resolveBody(config.body, true);

      return yield* printJson(
        yield* editComment(cwd, {
          author: authorOpts(config.author),
          body,
          commentId,
          edits,
        })
      );
    })
).pipe(Command.withDescription("Supersede an earlier record's body"));

export const commentCommand = Command.make("comment").pipe(
  Command.withDescription("Read and write the Review's Comments"),
  Command.withSubcommands([list, add, reply, action, resolve, reopen, edit])
);
