import type { FindingWrite } from "@shared/schemas/finding-write";
import { FindingWriteResult } from "@shared/schemas/finding-write";
import { Schema } from "effect";

import { client } from "./client";

const decodeResult = Schema.decodeUnknownSync(FindingWriteResult);

/** `POST /api/findings` — drop one append-only record; returns the stamped result. */
export async function write(body: FindingWrite): Promise<FindingWriteResult> {
  const result = await client.post("findings", { json: body }).json();
  return decodeResult(result);
}
