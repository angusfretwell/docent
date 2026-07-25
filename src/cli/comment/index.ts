import { commentStatuses } from "@shared/enums/comment-status";
import { CommentId } from "@shared/schemas/ids";
import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { parseRecordId } from "../specs";
import {
  commaSeparated,
  parseEnum,
  printJson,
  resolveBody,
  WorkingDirectory,
} from "../usage";
import { listComments } from "./list";
import type { AuthorOpts } from "./write";
import {
  actionComment,
  addComment,
  parseAnchorSpec,
  reopenComment,
  replyComment,
  resolveComment,
} from "./write";

const authorFlags = {
  agent: Flag.string("agent").pipe(
    Flag.optional,
    Flag.withDescription("Attribute the comment to an agent with this slug")
  ),
  display: Flag.string("display").pipe(
    Flag.optional,
    Flag.withDescription("Override the author's display name")
  ),
  model: Flag.string("model").pipe(
    Flag.optional,
    Flag.withDescription("The model of the agent attributed to the comment")
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
  Flag.withDescription("The comment's body (omit to read from STDIN)")
);

const commentFlag = Flag.string("comment").pipe(
  Flag.withDescription("The comment to append to (cmt_…)")
);

const list = Command.make(
  "list",
  {
    anchorFile: Flag.string("anchor-file").pipe(
      Flag.optional,
      Flag.withDescription("Filter by comments anchored on this file")
    ),
    author: Flag.string("author").pipe(
      Flag.optional,
      Flag.withDescription("Filter by comments this author took part in")
    ),
    status: commaSeparated(
      Flag.string("status").pipe(
        Flag.withDescription(
          "Filter by these statuses (comma-separated, or repeat flag)"
        )
      )
    ),
  },
  (config) =>
    Effect.gen(function* runList() {
      const cwd = yield* WorkingDirectory;
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
).pipe(Command.withDescription("List comments"));

const add = Command.make(
  "add",
  {
    anchor: Flag.string("anchor").pipe(
      Flag.optional,
      Flag.withDescription("A raw anchor as JSON")
    ),
    author: authorFlags,
    body: bodyFlag,
    change: Flag.boolean("change").pipe(
      Flag.withDescription("Anchor to the whole change")
    ),
    file: Flag.string("file").pipe(
      Flag.optional,
      Flag.withDescription("File to anchor to")
    ),
    line: Flag.string("line").pipe(
      Flag.optional,
      Flag.withDescription("Narrow --file to a line span (N, N:M, or N-M)")
    ),
    side: Flag.string("side").pipe(
      Flag.optional,
      Flag.withDescription("Side of the change to anchor to (base or head)")
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
).pipe(Command.withDescription("Create a comment"));

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
).pipe(Command.withDescription("Reply to a comment"));

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
).pipe(Command.withDescription("Mark a comment as actioned"));

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
).pipe(Command.withDescription("Resolve a comment"));

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
).pipe(Command.withDescription("Reopen a resolved comment"));

export const commentCommand = Command.make("comment").pipe(
  Command.withDescription("Read and write the review's comments"),
  Command.withSubcommands([list, add, reply, action, resolve, reopen])
);
