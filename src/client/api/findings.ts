import type { FindingWrite } from "@shared/schemas/finding-write";
import { FindingWriteResult } from "@shared/schemas/finding-write";
import { Schema } from "effect";

import { client } from "./client";

const decodeResult = Schema.decodeUnknownSync(FindingWriteResult);

export async function write(body: FindingWrite): Promise<FindingWriteResult> {
  const result = await client.post("findings", { json: body }).json();
  return decodeResult(result);
}
