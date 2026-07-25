import type { CommentWrite } from "@shared/schemas/comment-write";
import { CommentWriteResult } from "@shared/schemas/comment-write";
import { Schema } from "effect";

import { client } from "./client";

const decodeResult = Schema.decodeUnknownSync(CommentWriteResult);

export async function write(body: CommentWrite): Promise<CommentWriteResult> {
  const result = await client.post("comments", { json: body }).json();
  return decodeResult(result);
}
