import type { PendingRange } from "@shared/enums/pending-range";
import { Pending } from "@shared/schemas/pending";
import { Schema } from "effect";

import { client } from "./client";

const decodePending = Schema.decodeUnknownSync(Pending);

export async function get(
  range: PendingRange,
  signal?: AbortSignal
): Promise<Pending> {
  const body = await client
    .get("pending", { searchParams: { range }, signal })
    .json();
  return decodePending(body);
}
