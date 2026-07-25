import { Schema } from "effect";

import { walkthroughKinds } from "../enums/walkthrough-kind";
import { CommentRecord } from "./comment";
import { ChangeId, CommentId, ReviewId, WalkthroughId } from "./ids";
import { Walkthrough, WalkthroughSection } from "./walkthrough";

export class Review extends Schema.Class<Review>("Review")({
  base: Schema.String,
  branch: Schema.String,
  id: ReviewId,
  schema: Schema.Literal("docent/review"),
  /** Short human headline for the change; empty means absent (auto-created title-less, filled in later). */
  title: Schema.String,
}) {}

export class ChangeRecord extends Schema.Class<ChangeRecord>("ChangeRecord")({
  baseRef: Schema.String,
  baseSha: Schema.String,
  capturedAt: Schema.String,
  headRef: Schema.String,
  headSha: Schema.String,
  id: ChangeId,
  schema: Schema.Literal("docent/change"),
}) {}

export class ViewedEvent extends Schema.Class<ViewedEvent>("ViewedEvent")({
  blobSha: Schema.String,
  path: Schema.String,
  ts: Schema.String,
}) {}

/** The reviewer-toggled file and its head-blob SHA; the server stamps `ts` — the client never authors it. */
export class ViewedRequest extends Schema.Class<ViewedRequest>("ViewedRequest")(
  {
    blobSha: Schema.String,
    path: Schema.String,
  }
) {}

export class CommentEntry extends Schema.Class<CommentEntry>("CommentEntry")({
  /** Root anchor's file path — present only for `line`/`file` code arms. */
  anchorFile: Schema.optional(Schema.String),
  id: CommentId,
  records: Schema.Array(CommentRecord),
}) {}

export class WalkthroughEntry extends Schema.Class<WalkthroughEntry>(
  "WalkthroughEntry"
)({
  id: WalkthroughId,
  kind: Schema.Literals(walkthroughKinds),
  manifest: Schema.optional(Walkthrough),
  sections: Schema.Array(WalkthroughSection),
}) {}

export class ReviewSnapshot extends Schema.Class<ReviewSnapshot>(
  "ReviewSnapshot"
)({
  changes: Schema.Array(ChangeRecord),
  comments: Schema.Array(CommentEntry),
  review: Review,
  viewed: Schema.Array(ViewedEvent),
  walkthroughs: Schema.Array(WalkthroughEntry),
}) {}

export const ReviewError = Schema.Struct({ error: Schema.String });
