import { ReviewSnapshot } from "@shared/schemas/review";
import { Schema } from "effect";

import { client } from "./client";

const decodeSnapshot = Schema.decodeUnknownSync(ReviewSnapshot);

/** `GET /api/review` — the folded Review snapshot (findings, walkthroughs, viewed). */
export async function get(signal?: AbortSignal): Promise<ReviewSnapshot> {
  const body = await client.get("review", { signal }).json();
  return decodeSnapshot(body);
}
